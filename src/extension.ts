import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { exec, titleCase } from './utils';
import GObject from 'gi://GObject';
import type Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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

				await this._extension?._checkActive();
			});

			this.connect('destroy', () => {
				this._section?.destroy();
				this._section = null;

				this._extension = null;

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
				const item = new PopupMenuItem(_(titleCase(strategy)));
				this._section?.addMenuItem(item);
				this._items?.set(strategy, item);

				item.connect('activate', async () => {
					await exec(['fw-fanctrl', 'use', strategy]);
					await extension._checkStrategy();
				});
			}

			this.menu.addMenuItem(this._section);
		}

		_setActiveStrategy(strategy: string) {
			for (const [itemStrategy, menuItem] of this._items.entries()) {
				menuItem.setOrnament(
					itemStrategy === strategy ? Ornament.CHECK : Ornament.NONE,
				);
			}
		}

		_setFanCtrlActive(enabled: boolean) {
			this.set_checked(enabled);
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

		await this._checkActive();
		await this._checkStrategy();
	}

	async _checkStrategy() {
		try {
			const result = await exec([
				'fw-fanctrl',
				'--output-format=JSON',
				'print',
				'current',
			]);

			const { strategy }: { strategy: string } = JSON.parse(result);

			this._menu?._setActiveStrategy(strategy);
		} catch (error) {
			console.error(
				'[fw-fanctrl-revived] Error checking strategy:',
				error,
			);
		}
	}

	async _checkActive() {
		try {
			const result = await exec([
				'fw-fanctrl',
				'--output-format=JSON',
				'print',
				'active',
			]);

			const { active }: { active: boolean } = JSON.parse(result);

			this._indicator!.visible = active;
			this._menu?._setFanCtrlActive(active);
		} catch (error) {
			console.error(
				'[fw-fanctrl-revived] Error checking active status:',
				error,
			);
		}
	}
}
