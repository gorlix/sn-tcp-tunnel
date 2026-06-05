/**
 * Tests for index.js plugin entry point.
 *
 * - Sidebar button (100): setViewMode('control') + showPluginView()
 * - Config button: setViewMode('settings') + showPluginView()
 * - USB disconnect: stopTunnel()
 */

const mockStopTunnel = jest.fn().mockResolvedValue(null);
const mockUnregisterButton = jest.fn();
const mockRegisterButton = jest.fn();
const mockRegisterButtonListener = jest.fn();
const mockRegisterConfigButtonListener = jest.fn();
const mockShowPluginView = jest.fn();

const eventListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

const flush = () => new Promise(r => setTimeout(r, 20));

jest.mock('../App', () => 'MockApp');

jest.mock('../src/viewMode', () => ({
  setViewMode: jest.fn(),
  getViewMode: jest.fn(() => 'control'),
}));

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    init: jest.fn(),
    registerButton: mockRegisterButton,
    unregisterButton: mockUnregisterButton,
    registerButtonListener: mockRegisterButtonListener,
    registerConfigButtonListener: mockRegisterConfigButtonListener,
    registerConfigButton: jest.fn().mockResolvedValue(true),
    showPluginView: mockShowPluginView,
    closePluginView: jest.fn(),
  },
}));

const mockEmit = jest.fn();

jest.mock('react-native', () => ({
  AppRegistry: {registerComponent: jest.fn()},
  DeviceEventEmitter: {emit: mockEmit, addListener: jest.fn(() => ({remove: jest.fn()}))},
  Image: {resolveAssetSource: jest.fn(() => ({uri: 'mock://icon'}))},
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
      if (!eventListeners[event]) {eventListeners[event] = [];}
      eventListeners[event].push(cb);
      return {remove: jest.fn()};
    },
  })),
}));

require('../index.js');

const {setViewMode} = require('../src/viewMode');

const startupRegisterCall = mockRegisterButton.mock.calls[0] as unknown[];

const buttonListener = mockRegisterButtonListener.mock.calls[0]?.[0] as {
  onButtonPress: (event: {id: number; name: string}) => void;
};
const configListener = mockRegisterConfigButtonListener.mock.calls[0]?.[0] as {
  onClick: () => void;
};

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

  it('button 100 → setViewMode(control) + showPluginView() + emit(control)', () => {
    buttonListener.onButtonPress({id: 100, name: 'TCP Tunnel'});
    expect(setViewMode).toHaveBeenCalledWith('control');
    expect(mockShowPluginView).toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith('tunnelViewMode', 'control');
  });

  it('config button → setViewMode(settings) + showPluginView() + emit(settings)', () => {
    configListener.onClick();
    expect(setViewMode).toHaveBeenCalledWith('settings');
    expect(mockShowPluginView).toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith('tunnelViewMode', 'settings');
  });

  it('unknown button → no showPluginView()', () => {
    buttonListener.onButtonPress({id: 999, name: ''});
    expect(mockShowPluginView).not.toHaveBeenCalled();
  });

  it('onUsbDisconnect → stopTunnel()', async () => {
    eventListeners.onUsbDisconnect?.forEach(cb => cb());
    await flush();
    expect(mockStopTunnel).toHaveBeenCalled();
  });
});
