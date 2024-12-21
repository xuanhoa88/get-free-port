import net from "net";
import os from "os";

/**
 * Custom error for locked ports.
 */
export class LockedPortError extends Error {
	code: string;
	name: string;

	constructor(port: number) {
		super(`Port ${port} is locked`);
		this.name = "LockedPortError";
		this.code = "EPORTLOCKED";
	}
}

/**
 * Port Manager configuration and state.
 */
export const portManager = {
	locked: new Map<number, number>(),
	cleanupInterval: 15_000,
	minPort: 1024,
	maxPort: 65_535,
	cleanupTimer: null as NodeJS.Timeout | null,
};

/**
 * Check if the input is iterable.
 * @param ports - The object to test.
 * @returns True if the source is iterable, False otherwise.
 */
const isIterable = (ports: unknown): ports is Iterable<unknown> =>
	ports != null && typeof (ports as any)[Symbol.iterator] === "function";

/**
 * Creates a list of ports to check, adding fallback port 0.
 * @param ports - Ports to check.
 * @returns List of ports to check.
 */
const createPorts = (ports: number[] | null | undefined): number[] => {
	if (ports === null || ports === undefined) return [0];
	return isIterable(ports) ? [...new Set(ports)] : [ports as number];
};

/**
 * Clean up expired locked ports.
 */
const cleanupExpiredPorts = (): void => {
	const now = Date.now();
	for (const [port, timestamp] of portManager.locked) {
		if (now - timestamp >= portManager.cleanupInterval) {
			portManager.locked.delete(port);
		}
	}
};

/**
 * Get all local network interfaces.
 * @returns Host addresses.
 */
const createHosts = (): Set<string | undefined> => {
	const interfaces = os.networkInterfaces();
	return Object.values(interfaces).reduce<Set<string | undefined>>(
		(acc, iface) => {
			iface?.forEach((config) => {
				if (!config.internal) acc.add(config.address);
			});
			return acc;
		},
		new Set([undefined, "0.0.0.0"])
	);
};

/**
 * Check port availability.
 * @param options - Port check options.
 * @returns Verified port number.
 */
const checkPortAvailability = (
	options: net.ListenOptions & { timeout?: number }
): Promise<number> => {
	const server = net.createServer();
	server.unref();

	return new Promise((resolve, reject) => {
		const timeoutMs = options.timeout || 1000;
		const timeout = setTimeout(() => {
			server.close(() =>
				reject(new Error(`Port check timed out after ${timeoutMs}ms`))
			);
		}, timeoutMs);

		server.once("error", (err) => {
			clearTimeout(timeout);
			server.close(() => reject(err));
		});

		server.listen(options, () => {
			clearTimeout(timeout);
			const address = server.address();
			if (address && typeof address === "object") {
				server.close(() => resolve(address.port));
			}
		});
	});
};

/**
 * Verify port availability across hosts.
 * @param options - Port options.
 * @param hosts - Network hosts.
 * @returns Verified port number.
 */
const verifyPort = async (
	options: net.ListenOptions & { timeout?: number },
	hosts: Set<string | undefined>
): Promise<number> => {
	if (options.host || options.port === 0) {
		return checkPortAvailability(options);
	}

	const results = await Promise.all(
		Array.from(hosts).map(async (host) => {
			try {
				return await checkPortAvailability({ ...options, host });
			} catch (error: any) {
				if (!["EADDRNOTAVAIL", "EINVAL"].includes(error.code)) {
					throw error;
				}
				return null;
			}
		})
	);

	const validPort = results.find(
		(port): port is number => typeof port === "number" && !isNaN(port)
	);

	if (!validPort) {
		throw new Error(
			`Port ${
				options.port
			} is not available on any of the network interfaces: ${[...hosts].join(
				", "
			)}`
		);
	}

	return validPort;
};

/**
 * Get an available port.
 * @param options - Configuration options.
 * @returns Available port number.
 */
export const getOpenPort = async (
	options: {
		port?: number | number[];
		exclude?: Iterable<number>;
		timeout?: number;
	} = {}
): Promise<number> => {
	const exclude = new Set(isIterable(options.exclude) ? options.exclude : []);

	if (!portManager.cleanupTimer) {
		portManager.cleanupTimer = setInterval(
			cleanupExpiredPorts,
			portManager.cleanupInterval
		);
		if (portManager.cleanupTimer.unref) {
			portManager.cleanupTimer.unref();
		}
	}

	const hosts = createHosts();
	const portsToCheck = createPorts(
		Array.isArray(options.port)
			? [...new Set(options.port)]
			: options.port !== undefined
			? [options.port]
			: undefined
	);

	for (const port of portsToCheck) {
		try {
			if (exclude.has(port) || portManager.locked.has(port)) {
				if (portManager.locked.has(port) && port !== 0) {
					throw new LockedPortError(port);
				}
				continue;
			}

			let availablePort = await verifyPort({ ...options, port }, hosts);

			while (portManager.locked.has(availablePort)) {
				if (port !== 0) throw new LockedPortError(port);

				availablePort = await verifyPort({ ...options, port: 0 }, hosts);
			}

			portManager.locked.set(availablePort, Date.now());
			return availablePort;
		} catch (error: any) {
			if (error.code === "EADDRINUSE") {
				throw error;
			}
			if (
				!["EACCES"].includes(error.code) &&
				!(error instanceof LockedPortError)
			) {
				throw error;
			}
		}
	}

	if (portsToCheck.some((port) => portManager.locked.has(port))) {
		throw new LockedPortError(
			portsToCheck.find((port) => portManager.locked.has(port))!
		);
	}

	throw new Error("No available ports found");
};

/**
 * Create array of sequential port numbers.
 * @param from - Starting port.
 * @param to - Ending port.
 * @returns List of port numbers.
 */
export const getPortRange = (from: number, to: number): number[] => {
	if (!Number.isInteger(from) || !Number.isInteger(to)) {
		throw new TypeError("`from` and `to` must be integer numbers");
	}

	if (from < portManager.minPort || from > portManager.maxPort) {
		throw new RangeError(
			`\`from\` must be between ${portManager.minPort} and ${portManager.maxPort}`
		);
	}

	if (to < portManager.minPort || to > portManager.maxPort) {
		throw new RangeError(
			`\`to\` must be between ${portManager.minPort} and ${portManager.maxPort}`
		);
	}

	if (from > to) {
		throw new RangeError("`to` must be greater than or equal to `from`");
	}

	return Array.from({ length: to - from + 1 }, (_, i) => from + i);
};

/**
 * Clear all locked ports.
 */
export const clearLockedPorts = (): void => {
	portManager.locked.clear();
	if (portManager.cleanupTimer) {
		clearInterval(portManager.cleanupTimer);
		portManager.cleanupTimer = null;
	}
};
