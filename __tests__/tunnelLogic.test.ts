/**
 * Tests for index.js plugin entry point.
 *
 * index.js now only:
 *  - Registers the main sidebar button
 *  - On button press: calls PluginManager.showPluginView()
 *  - On USB disconnect: calls TcpTunnelModule.stopTunnel()
 *
 * Tunnel start/stop logic lives in App.tsx (tested separately).
 */

const mockStopTunnel = jest.fn().mockResolvedValue(null);
const mockUnregisterButton = jest.fn();
const mockRegisterButton = jest.fn();
const mockRegisterButtonListener = jest.fn();
const mockShowPluginView = jest.fn();

const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

const flush = () => new Promise(r => setTimeout(r, 20));

jest.mock('../App', () => 'MockApp');

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    init: jest.fn(),
    registerButton: mockRegisterButton,
    unregisterButton: mockUnregisterButton,
    registerButtonListener: mockRegisterButtonListener,
    showPluginView: mockShowPluginView,
    closePluginView: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  AppRegistry: {registerComponent: jest.fn()},
  Image: {resolveAssetSource: jest.fn(() => ({uri: 'mock://icon'}))},
  ToastAndroid: {show: jest.fn(), showWithGravity: jest.fn(), SHORT: 2000, TOP: 48},
  NativeModules: {
    TcpTunnelModule: {
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

// Capture startup state before beforeEach clears mocks.
const startupRegisterCall = mockRegisterButton.mock.calls[0] as unknown[];

const buttonListener = mockRegisterButtonListener.mock.calls[0]?.[0] as {
  onButtonPress: (event: {id: number; name: string}) => void;
};

function pressButton(id: number) {
  buttonListener.onButtonPress({id, name: ''});
}

describe('index.js entry point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStopTunnel.mockResolvedValue(null);
  });

  it('registers main button (id=100, type=1, enable=true) on startup', () => {
    expect(startupRegisterCall).toEqual([
      1,
      ['NOTE', 'DOC'],
      expect.objectContaining({id: 100, enable: true}),
    ]);
  });

  it('button 100 press → showPluginView()', () => {
    pressButton(100);
    expect(mockShowPluginView).toHaveBeenCalled();
  });

  it('unknown button press → no showPluginView()', () => {
    pressButton(999);
    expect(mockShowPluginView).not.toHaveBeenCalled();
  });

  it('onUsbDisconnect → calls stopTunnel()', async () => {
    eventListeners.onUsbDisconnect?.forEach(cb => cb());
    await flush();
    expect(mockStopTunnel).toHaveBeenCalled();
  });
});
