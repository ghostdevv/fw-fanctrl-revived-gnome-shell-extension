import Gio from 'gi://Gio';

/**
 * @see https://gjs.guide/guides/gio/subprocesses.html
 * @see https://stackoverflow.com/a/61150669
 */
export function exec(
	argv: string[],
	input: string | null = null,
	cancellable: Gio.Cancellable | null = null,
) {
	let flags = Gio.SubprocessFlags.STDOUT_PIPE;

	if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

	const proc = new Gio.Subprocess({
		argv: argv,
		flags: flags,
	});

	proc.init(cancellable);

	return new Promise<string>((resolve, reject) => {
		proc.communicate_utf8_async(input, cancellable, (proc, res) => {
			try {
				resolve(proc!.communicate_utf8_finish(res)[1]);
			} catch (e) {
				reject(e);
			}
		});
	});
}

export function titleCase(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
