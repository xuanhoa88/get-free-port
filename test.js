const net = require("net");
const {
	getOpenPort,
	getPortRange,
	clearLockedPorts,
	LockedPortError,
	portManager,
} = require(".");

// Mocking necessary modules for testing
jest.mock("net");
jest.mock("os", () => ({
	networkInterfaces: jest.fn(() => ({
		eth0: [{ address: "192.168.1.1", internal: false }],
	})),
}));

describe("Port Manager", () => {
	let mockServer;

	beforeEach(() => {
		// Reset mock server for each test
		mockServer = {
			listen: jest.fn((options, callback) => {
				setImmediate(() => callback?.());
				return mockServer;
			}),
			close: jest.fn((callback) => {
				setImmediate(() => callback?.());
				return mockServer;
			}),
			unref: jest.fn(),
			once: jest.fn(),
			address: jest.fn(() => ({ port: 12345 })),
		};

		net.createServer.mockImplementation(() => mockServer);
	});

	afterEach(() => {
		clearLockedPorts();
		jest.clearAllMocks();
	});

	describe("getOpenPort", () => {
		test("should return an available port within valid range", async () => {
			const port = await getOpenPort();
			expect(port).toBeGreaterThanOrEqual(1024);
			expect(port).toBeLessThanOrEqual(65535);
			expect(mockServer.listen).toHaveBeenCalled();
			expect(mockServer.close).toHaveBeenCalled();
		});

		test("should honor specific port request when available", async () => {
			const requestedPort = 12345;
			const port = await getOpenPort({ port: requestedPort });
			expect(port).toBe(requestedPort);
			expect(mockServer.listen).toHaveBeenCalledWith(
				expect.objectContaining({ port: requestedPort }),
				expect.any(Function)
			);
		});

		test("should throw LockedPortError if the port is locked", async () => {
			const lockedPort = 8080;
			// Mock the getOpenPort implementation for locked port scenario
			mockServer.listen.mockImplementation((options, callback) => {
				if (String(options.port) === String(lockedPort)) {
					throw new LockedPortError(`Port ${lockedPort} is locked`);
				}
				callback?.();
				return mockServer;
			});

			// Lock the port
			portManager.locked.set(lockedPort, Date.now());

			// Verify that attempting to get the locked port throws error
			await expect(getOpenPort({ port: lockedPort })).rejects.toThrow(
				LockedPortError
			);
			expect(mockServer.listen).not.toHaveBeenCalled();
		});

		test("should respect port exclusion list", async () => {
			const excludedPorts = [8080, 8081];
			const port = await getOpenPort({ exclude: excludedPorts });

			expect(excludedPorts).not.toContain(port);
			expect(mockServer.listen).toHaveBeenCalledWith(
				expect.objectContaining({
					port: expect.not.arrayContaining(excludedPorts),
				}),
				expect.any(Function)
			);
		});

		test("should handle EADDRINUSE error", async () => {
			mockServer.listen.mockImplementation((options, callback) => {
				setImmediate(() => {
					// Simulate the error event
					mockServer.once.mock.calls.find((call) => call[0] === "error")?.[1](
						Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" })
					);
				});
				return mockServer;
			});

			await expect(getOpenPort()).rejects.toThrow("EADDRINUSE");

			// Wait for the next tick to ensure the close method is called
			await new Promise((resolve) => setImmediate(resolve));

			// Verify that close was called after the error
			expect(mockServer.close).toHaveBeenCalled();
		});

		test("should timeout if port check takes too long", async () => {
			const timeout = 100;
			mockServer.listen.mockImplementation(() => {
				// Never call the callback to simulate hanging
				return mockServer;
			});

			await expect(getOpenPort({ timeout })).rejects.toThrow(
				`Port check timed out after ${timeout}ms`
			);
		});
	});

	describe("getPortRange", () => {
		test("should return correct port range array", () => {
			const range = getPortRange(1024, 1029);
			expect(range).toEqual([1024, 1025, 1026, 1027, 1028, 1029]);
		});

		test.each([
			[1029, 1024, "`to` must be greater than or equal to `from`"],
			[70000, 80000, "`from` must be between 1024 and 65535"],
			["a", 80000, "`from` and `to` must be integer numbers"],
			[1024, "b", "`from` and `to` must be integer numbers"],
			[1024.5, 1025, "`from` and `to` must be integer numbers"],
		])("should validate range inputs (%s, %s)", (from, to, expectedError) => {
			expect(() => getPortRange(from, to)).toThrow(expectedError);
		});
	});

	describe("clearLockedPorts", () => {
		test("should clear all locked ports", () => {
			portManager.locked.set(8080, Date.now());
			portManager.locked.set(8081, Date.now());

			expect(portManager.locked.size).toBe(2);
			clearLockedPorts();
			expect(portManager.locked.size).toBe(0);
		});
	});
});
