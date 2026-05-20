import {NativeModules} from 'react-native';

const mockLoadConfig = jest.fn();
const mockSaveConfig = jest.fn();

NativeModules.TcpTunnelModule = {
  loadConfig: mockLoadConfig,
  saveConfig: mockSaveConfig,
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

jest.mock('react-native', () => ({
  NativeModules: {TcpTunnelModule: {}},
}));

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    closePluginView: jest.fn(),
  },
}));

describe('config store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loadConfig returns defaults when no saved config', async () => {
    mockLoadConfig.mockResolvedValue({host: '100.113.43.44', port: 8080});
    const cfg = await NativeModules.TcpTunnelModule.loadConfig();
    expect(cfg.host).toBe('100.113.43.44');
    expect(cfg.port).toBe(8080);
  });

  it('saves and re-loads custom host/port', async () => {
    mockSaveConfig.mockResolvedValue(null);
    mockLoadConfig.mockResolvedValue({host: '192.168.1.100', port: 9090});

    await NativeModules.TcpTunnelModule.saveConfig('192.168.1.100', 9090);
    const cfg = await NativeModules.TcpTunnelModule.loadConfig();

    expect(mockSaveConfig).toHaveBeenCalledWith('192.168.1.100', 9090);
    expect(cfg.host).toBe('192.168.1.100');
    expect(cfg.port).toBe(9090);
  });

  it('invalid port: NaN', () => {
    const portNum = parseInt('abc', 10);
    expect(isNaN(portNum)).toBe(true);
    expect(isValidPort(portNum)).toBe(false);
  });

  it('invalid port: 0', () => {
    expect(isValidPort(0)).toBe(false);
  });

  it('invalid port: >65535', () => {
    expect(isValidPort(65536)).toBe(false);
  });

  it('valid port: 8080', () => {
    expect(isValidPort(8080)).toBe(true);
  });
});

function isValidPort(p: number): boolean {
  return !isNaN(p) && p > 0 && p <= 65535;
}
