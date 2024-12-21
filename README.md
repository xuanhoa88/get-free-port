# Port Manager Utility

This Node.js utility helps manage and check the availability of ports on a machine. It supports features like locking ports, excluding specific ports, and managing port ranges, making it ideal for network-related applications and server setups.

## Features

- **Port Availability Check**: Ensures a port is available on local network interfaces.
- **Port Locking**: Temporarily locks ports to prevent simultaneous usage.
- **Custom Port Ranges**: Defines and iterates over specific port ranges.
- **Exclusions**: Excludes certain ports from being used.
- **Timeout Handling**: Configures timeouts for port checks.

## Installation

```bash
npm install get-open-port
```

## Usage

### Get a Free Port
Retrieve an available port, optionally specifying preferred ports or exclusions:

```javascript
const { getOpenPort } = require("get-open-port");

(async () => {
    try {
        const port = await getOpenPort({
            port: [3000, 4000], // Optional preferred ports
            exclude: [8080],    // Ports to exclude
            timeout: 2000       // Optional timeout (ms)
        });
        console.log(`Available port: ${port}`);
    } catch (error) {
        console.error("Error getting a free port:", error);
    }
})();
```

### Lock Ports
Prevent specific ports from being reused until unlocked or cleaned up:

```javascript
const { portManager } = require("get-open-port");

// Lock port 3000
portManager.locked.set(3000, Date.now());
```

### Clear Locked Ports
Unlock all previously locked ports:

```javascript
const { clearLockedPorts } = require("get-open-port");

clearLockedPorts();
```

### Port Range Utility
Generate a range of port numbers:

```javascript
const { getPortRange } = require("get-open-port");

const range = getPortRange(3000, 3010);
console.log(range); // [3000, 3001, 3002, ..., 3010]
```

### Handle Port Lock Errors
Handle errors related to locked ports:

```javascript
const { getOpenPort, LockedPortError } = require("get-open-port");

(async () => {
    try {
        const port = await getOpenPort({ port: [3000] });
        console.log(`Available port: ${port}`);
    } catch (error) {
        if (error instanceof LockedPortError) {
            console.error(`Port ${error.port} is locked.`);
        } else {
            console.error("An error occurred:", error);
        }
    }
})();
```

## Configuration

The utility uses the following default settings:

- **Minimum Port**: 1024
- **Maximum Port**: 65535
- **Cleanup Interval**: 15 seconds (locked ports are cleared after this duration)

These settings can be adjusted by modifying the `portManager` object:

```javascript
const { portManager } = require("get-open-port");

portManager.minPort = 2000;
portManager.maxPort = 60000;
portManager.cleanupInterval = 10_000; // 10 seconds
```

## API

### `getOpenPort(options)`
Finds an available port.

#### Parameters
- `options.port` (Array<number>|null): Preferred ports to check (default: `[0]`).
- `options.exclude` (Iterable<number>|null): Ports to exclude.
- `options.timeout` (number): Timeout for each port check (default: 1000 ms).

#### Returns
- `Promise<number>`: The first available port.

### `getPortRange(from, to)`
Generates a range of ports.

#### Parameters
- `from` (number): Starting port.
- `to` (number): Ending port.

#### Returns
- `Array<number>`: List of ports.

### `clearLockedPorts()`
Clears all locked ports and stops the cleanup timer.

### `LockedPortError`
Custom error thrown for locked ports.

## License

Licensed under [MIT](LICENSE) © 2024 xuanguyen


