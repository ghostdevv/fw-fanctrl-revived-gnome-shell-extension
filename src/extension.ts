import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { exec, titleCase } from './utils';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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
		_extension: FwFanCtrl | null = null;

		_init() {
			super._init({
				title: _('Fan Control'),
				iconName: 'weather-tornado-symbolic',
				toggleMode: true,
			});

			this.menu.setHeader(
				'weather-tornado-symbolic',
				_('Framework Fan Control'),
			);

			this.connect('clicked', async () => {
				await exec(['fw-fanctrl', this?.checked ? 'resume' : 'pause']);
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
					icon_name: 'preferences-system-symbolic',
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

				this._extension = null;

				settingsButton.destroy();

				for (const item of this._items.values()) {
					item.destroy();
				}

				this._items.clear();
			});
		}

		async _setup(extension: FwFanCtrl) {
			this._extension = extension;

			const result = await exec([
				'fw-fanctrl',
				'--output-format=JSON',
				'print',
				'list',
			]);

			const { strategies }: { strategies: string[] } = JSON.parse(result);

			this._section = new PopupMenuSection();

			for (const strategy of strategies) {
				const item = new PopupMenuItem(titleCase(strategy));
				this._section?.addMenuItem(item);
				this._items?.set(strategy, item);

				item.connect('activate', async () => {
					await exec(['fw-fanctrl', 'use', strategy]);
					await extension._sync();
				});
			}

			this.menu.addMenuItem(this._section);
		}

		_setFanState(state: FanState) {
			this.menu.setHeader(
				'weather-tornado-symbolic',
				_('Framework Fan Control'),
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

export default class FwFanCtrl extends Extension {
	private _indicator: InstanceType<typeof SystemIndicator> | null = null;
	private _menu: InstanceType<typeof QuickSettingsMenu> | null = null;
	private _sourceId: number | null = null;
	private _settings: Gio.Settings | null = null;

	enable() {
		this._settings = this.getSettings();

		this._menu = new QuickSettingsMenu();
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

		try {
			const result = await exec([
				'fw-fanctrl',
				'--output-format=JSON',
				'print',
				'all',
			]);

			const state: FanState = JSON.parse(result);

			this._menu?._setFanState(state);
			this._indicator!.visible = state.active;
		} catch (error) {
			console.error('[fw-fanctrl-revived] Error checking state', error);
		}
	}
}
