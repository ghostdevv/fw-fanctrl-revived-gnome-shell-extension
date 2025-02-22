import type Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {
	ExtensionPreferences,
	gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class FwFanCtrlPreferences extends ExtensionPreferences {
	_settings: Gio.Settings | null = null;

	async fillPreferencesWindow(window: Adw.PreferencesWindow) {
		const page = new Adw.PreferencesPage({
			title: _('Framework Fan Control Settings'),
			icon_name: 'dialog-information-symbolic',
		});

		window.add(page);

		const group = new Adw.PreferencesGroup({
			title: _('Extension Settings'),
			description: _('Configure the behavior of the extension'),
		});

		page.add(group);

		const settings = this.getSettings();

		const adjustment = new Gtk.Adjustment({
			value: settings.get_int('refresh-interval'),
			step_increment: 1,
			upper: 60,
			lower: 3,
		});

		const interval = new Adw.SpinRow({
			title: _('Refresh Interval'),
			subtitle: _(
				'The duration (in seconds) between refreshes of the extensions fan control data.',
			),
			adjustment,
			value: settings.get_int('refresh-interval'),
		});

		adjustment.connect('value-changed', () => {
			settings.set_int('refresh-interval', adjustment.get_value());
		});

		group.add(interval);
	}
}
