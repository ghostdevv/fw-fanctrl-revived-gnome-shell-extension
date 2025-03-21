import Gio from 'gi://Gio';

type Result = { error: null; output: string } | { error: Error; output: null };

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

	return new Promise<Result>((resolve) => {
		proc.communicate_utf8_async(input, cancellable, (proc, res) => {
			try {
				const output = proc!.communicate_utf8_finish(res)[1];
				const status = proc!.get_exit_status();

				if (status === 0) {
					resolve({ output, error: null });
				} else {
					resolve({
						output: null,
						error: new Error(
							`Command failed with status ${status}. Output: "${output}"`,
						),
					});
				}
			} catch (e) {
				resolve({
					output: null,
					error: e instanceof Error ? e : new Error(`${e}`),
				});
			}
		});
	});
}

export function titleCase(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}
