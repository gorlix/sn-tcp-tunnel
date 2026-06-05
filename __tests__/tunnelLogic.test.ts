/**
 * Tests for index.js tunnel toggle logic.
 * Module loaded once; active flag is shared state across tests.
 * Sequential order: inactive→active→inactive→(USB active)→inactive→(USB inactive noop)
 *
 * Button clicks are simulated by calling the listener registered via
 * PluginManager.registerButtonListener({ onButtonPress }) — the correct sn-plugin-lib
 * API. The old onButtonClick shim does not exist in the real library.
 */

const mockLoadConfig = jest.fn().mockResolvedValue({host: '100.113.43.44', port: 8080});
const mockStartTunnel = jest.fn().mockResolvedValue(null);
const mockStopTunnel = jest.fn().mockResolvedValue(null);
const mockUnregisterButton = jest.fn();
const mockRegisterButton = jest.fn();
const mockRegisterButtonListener = jest.fn();
const mockRegisterConfigButtonListener = jest.fn();

const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

// flush all queued microtasks + one timer tick
const flush = () => new Promise(r => setTimeout(r, 20));

jest.mock('../App', () => 'MockApp');

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    init: jest.fn(),
    registerButton: mockRegisterButton,
    unregisterButton: mockUnregisterButton,
    registerButtonListener: mockRegisterButtonListener,
    registerConfigButtonListener: mockRegisterConfigButtonListener,
    registerConfigButton: jest.fn().mockResolvedValue(true),
    showPluginView: jest.fn(),
    closePluginView: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  AppRegistry: {registerComponent: jest.fn()},
  Image: {resolveAssetSource: jest.fn(() => ({uri: 'mock://icon'}))},
  NativeModules: {
    TcpTunnelModule: {
      loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
      startTunnel: (...args: unknown[]) => mockStartTunnel(...args),
      stopTunnel: (...args: unknown[]) => mockStopTunnel(...args),
      writeLog: jest.fn().mockResolvedValue(null),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    },
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: (event: string, cb: (...args: unknown[]) => void) => {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push(cb);
      return {remove: jest.fn()};
    },
  })),
}));

require('../index.js');

// Capture the button listener registered by index.js so tests can simulate presses.
const buttonListener = mockRegisterButtonListener.mock.calls[0]?.[0] as {
  onButtonPress: (event: {id: number; name: string}) => void;
};

function pressButton(id: number) {
  buttonListener.onButtonPress({id, name: ''});
}

describe('tunnel toggle logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue({host: '100.113.43.44', port: 8080});
    mockStartTunnel.mockResolvedValue(null);
    mockStopTunnel.mockResolvedValue(null);
  });

  // State: inactive → active
  it('activate: loadConfig → startTunnel → unregisterButton(100) → registerButton', async () => {
    pressButton(100);
    await flush();

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockStartTunnel).toHaveBeenCalledWith('100.113.43.44', 8080, 8888);
    expect(mockUnregisterButton).toHaveBeenCalledWith(100);
    expect(mockRegisterButton).toHaveBeenCalledWith(
      1,
      ['NOTE', 'DOC'],
      expect.objectContaining({id: 100}),
    );
  });

  // State: active → inactive
  it('deactivate: stopTunnel → swaps icon, no loadConfig', async () => {
    pressButton(100);
    await flush();

    expect(mockStopTunnel).toHaveBeenCalled();
    expect(mockUnregisterButton).toHaveBeenCalledWith(100);
    expect(mockRegisterButton).toHaveBeenCalledWith(
      1,
      ['NOTE', 'DOC'],
      expect.objectContaining({id: 100}),
    );
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  // State: inactive → active (click), then USB disconnect → inactive
  it('onUsbDisconnect while active → calls stopTunnel', async () => {
    pressButton(100);
    await flush();
    jest.clearAllMocks();
    mockStopTunnel.mockResolvedValue(null);

    eventListeners.onUsbDisconnect?.forEach(cb => cb());
    await flush();

    expect(mockStopTunnel).toHaveBeenCalled();
  });

  // State: inactive (deactivated by USB in previous test)
  it('onUsbDisconnect while inactive → no-op', async () => {
    eventListeners.onUsbDisconnect?.forEach(cb => cb());
    await flush();

    expect(mockStopTunnel).not.toHaveBeenCalled();
  });
});
