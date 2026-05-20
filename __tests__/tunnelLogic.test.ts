/**
 * Tests for index.js tunnel toggle logic.
 * Module loaded once; active flag is shared state across tests.
 * Sequential order: inactive→active→inactive→(USB active)→inactive→(USB inactive noop)
 */

const mockLoadConfig = jest.fn().mockResolvedValue({host: '100.113.43.44', port: 8080});
const mockStartTunnel = jest.fn().mockResolvedValue(null);
const mockStopTunnel = jest.fn().mockResolvedValue(null);
const mockUnregisterButton = jest.fn();
const mockRegisterButton = jest.fn();
const mockOnButtonClick = jest.fn();

const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

// flush all queued microtasks + one timer tick
const flush = () => new Promise(r => setTimeout(r, 20));

jest.mock('../App', () => 'MockApp');

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    init: jest.fn(),
    registerButton: mockRegisterButton,
    unregisterButton: mockUnregisterButton,
    onButtonClick: mockOnButtonClick,
    openPluginView: jest.fn(),
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

const clickHandlers: Record<number, () => void> = {};
mockOnButtonClick.mock.calls.forEach(([id, cb]: [number, () => void]) => {
  clickHandlers[id] = cb;
});

describe('tunnel toggle logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue({host: '100.113.43.44', port: 8080});
    mockStartTunnel.mockResolvedValue(null);
    mockStopTunnel.mockResolvedValue(null);
  });

  // State: inactive → active
  it('activate: loadConfig → startTunnel → unregisterButton(100) → registerButton', async () => {
    clickHandlers[100]();
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
    clickHandlers[100]();
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
    clickHandlers[100]();
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
