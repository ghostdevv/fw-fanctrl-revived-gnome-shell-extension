import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { exec, titleCase } from './utils';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {
	PopupMenuSection,
	PopupMenuItem,
	Ornament,
} from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {
	QuickMenuToggle,
	SystemIndicator,
} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {
	Extension,
	gettext as _,
	type ExtensionMetadata,
} from 'resource:///org/gnome/shell/extensions/extension.js';

interface FanState {
	strategy: string;
	active: boolean;
	speed: string;
	temperature: string;
}

const QuickSettingsMenu = GObject.registerClass(
	class QuickSettingsMenu extends QuickMenuToggle {
		_section: PopupMenuSection | null = null;
		_items = new Map<string, PopupMenuItem>();

		constructor(readonly _extension: FwFanCtrl) {
			super({
				title: _('Fan Control'),
				toggleMode: true,
				gicon: Gio.icon_new_for_string(
					`${_extension.path}/icons/fw-fanctrl-revived.svg`,
				),
			});

			this.menu.setHeader(
				Gio.icon_new_for_string(
					`${_extension.path}/icons/fw-fanctrl-revived.svg`,
				),
				_('Framework Fan Control'),
			);

			this.connect('clicked', async () => {
				const newState = this.checked ? 'resume' : 'pause';
				const { error } = await exec(['fw-fanctrl', newState]);

				if (error) {
					return this._extension?.logger.error(
						`Error switching to ${newState}d state`,
						error,
					);
				}

				await this._extension?._sync();
			});

			// Setting button code based on GPL 3 Licensed Code from:
			// https://github.com/maniacx/Battery-Health-Charging/blob/522f698c9f70027da017bccbedbc15d0b61a2a25/lib/thresholdPanel.js#L45-L56
			const settingsButton = new St.Button({
				style_class: 'fw-fctrl-preferences-button',
				y_align: Clutter.ActorAlign.CENTER,
				x_align: Clutter.ActorAlign.END,
				x_expand: true,
				child: new St.Icon({
					icon_name: 'applications-system-symbolic',
					icon_size: 14,
				}),
			});

			this.menu.addHeaderSuffix(settingsButton);
			settingsButton.connect('clicked', () => {
				this._extension?.openPreferences();
			});

			this.connect('destroy', () => {
				this._section?.destroy();
				this._section = null;

				settingsButton.destroy();

				for (const item of this._items.values()) {
					item.destroy();
				}

				this._items.clear();
			});
		}

		async _setup(extension: FwFanCtrl) {
			const { error, output } = await exec([
				'fw-fanctrl',
				'--output-format=JSON',
				'print',
				'list',
			]);

			if (error) {
				return this._extension.logger.error(
					'Error fetching fan control strategies',
					error,
				);
			}

			const { strategies }: { strategies: string[] } = JSON.parse(output);

			this._section = new PopupMenuSection();

			for (const strategy of strategies) {
				const item = new PopupMenuItem(titleCase(strategy));
				this._section?.addMenuItem(item);
				this._items?.set(strategy, item);

				item.connect('activate', async () => {
					const { error } = await exec([
						'fw-fanctrl',
						'use',
						strategy,
					]);

					if (error) {
						return this._extension?.logger.error(
							`Error switching to ${strategy} strategy`,
							error,
						);
					}

					await extension._sync();
				});
			}

			this.menu.addMenuItem(this._section);
		}

		_setHeaderSubtitle(text: string) {
			// @ts-expect-error using a private class property
			this.menu._headerSubtitle.set({
				visible: true,
				text,
			});
		}

		_setFailed() {
			this._setHeaderSubtitle('fw-fanctrl failed, please check logs');
			this.subtitle = 'fw-fanctrl failed';
		}

		_setFanState(state: FanState) {
			this._setHeaderSubtitle(
				`Temperature: ${state.temperature}°C Fan Speed ${state.speed}%`,
			);
			this.subtitle = `${state.temperature}°C ${state.speed}%`;

			this.set_checked(state.active);

			for (const [itemStrategy, menuItem] of this._items.entries()) {
				menuItem.setOrnament(
					itemStrategy === state.strategy
						? Ornament.CHECK
						: Ornament.NONE,
				);
			}
		}
	},
);

type Logger = typeof console;

export default class FwFanCtrl extends Extension {
	private _indicator: InstanceType<typeof SystemIndicator> | null = null;
	private _menu: InstanceType<typeof QuickSettingsMenu> | null = null;
	private _sourceId: number | null = null;
	private _settings: Gio.Settings | null = null;
	public readonly logger: Logger;

	constructor(metadata: ExtensionMetadata) {
		super(metadata);

		if ('getLogger' in this) {
			// @ts-expect-error Types package needs updating, but this is right
			this.logger = this.getLogger();
		} else {
			this.logger = console;
		}
	}

	enable() {
		this._settings = this.getSettings();

		this._menu = new QuickSettingsMenu(this);
		this._indicator = new SystemIndicator();
		this._indicator.quickSettingsItems.push(this._menu);

		Main.panel.statusArea.quickSettings.addExternalIndicator(
			this._indicator,
		);

		this._createLoop(this._settings.get_int('refresh-interval'));
		this._settings.connect('changed::refresh-interval', (settings, key) => {
			this._createLoop(settings.get_int('refresh-interval'));
		});

		this._sync();
	}

	disable() {
		this._indicator?.destroy();
		this._indicator = null;

		this._menu?.destroy();
		this._menu = null;

		this._settings = null;

		if (this._sourceId) {
			GLib.Source.remove(this._sourceId);
			this._sourceId = null;
		}
	}

	_createLoop(interval: number) {
		if (this._sourceId) {
			GLib.Source.remove(this._sourceId);
			this._sourceId = null;
		}

		this._sourceId = GLib.timeout_add_seconds(
			GLib.PRIORITY_DEFAULT,
			interval,
			() => {
				this._sync();
				return GLib.SOURCE_CONTINUE;
			},
		);
	}

	async _sync() {
		if (this._menu && this._menu._items.size == 0) {
			await this._menu._setup(this);
		}

		const { error, output } = await exec([
			'fw-fanctrl',
			'--output-format=JSON',
			'print',
			'all',
		]);

		if (error) {
			this._menu?._setFailed();
			return this.logger.error('Error checking state', error);
		}

		const state: FanState = JSON.parse(output);

		this._menu?._setFanState(state);
		this._indicator!.visible = state.active;
	}
}
