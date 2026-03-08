import React, { useState, useEffect, useCallback } from 'react';
import {
  VscPackage, VscVm, VscRefresh, VscPlay, VscCircleFilled,
} from 'react-icons/vsc';
import { invoke } from '@tauri-apps/api/core';
import { DockerContainer, WslDistro } from '../types';

interface EnvironmentHubProps {
  onConnectDocker: (containerId: string, containerName: string, shell?: string) => void;
  onConnectWsl: (distro: string) => void;
  onClose: () => void;
}

const EnvironmentHub: React.FC<EnvironmentHubProps> = ({ onConnectDocker, onConnectWsl, onClose }) => {
  const [tab, setTab] = useState<'docker' | 'wsl'>('docker');
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [distros, setDistros] = useState<WslDistro[]>([]);
  const [dockerError, setDockerError] = useState('');
  const [wslError, setWslError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadDocker = useCallback(async () => {
    setLoading(true);
    setDockerError('');
    try {
      const list = await invoke<DockerContainer[]>('list_docker_containers');
      setContainers(list);
    } catch (err: any) {
      setDockerError(String(err));
    }
    setLoading(false);
  }, []);

  const loadWsl = useCallback(async () => {
    setLoading(true);
    setWslError('');
    try {
      const list = await invoke<WslDistro[]>('list_wsl_distros');
      setDistros(list);
    } catch (err: any) {
      setWslError(String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'docker') loadDocker();
    else loadWsl();
  }, [tab, loadDocker, loadWsl]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <VscPackage className="dialog__header-icon" />
          <h2 className="dialog__title">Environment Hub</h2>
        </div>
        <div className="dialog__body">
          <div className="env-hub__tabs">
            <button className={`env-hub__tab ${tab === 'docker' ? 'env-hub__tab--active' : ''}`}
              onClick={() => setTab('docker')}>
              <VscPackage /> Docker Containers
            </button>
            <button className={`env-hub__tab ${tab === 'wsl' ? 'env-hub__tab--active' : ''}`}
              onClick={() => setTab('wsl')}>
              <VscVm /> WSL Distributions
            </button>
            <button className="env-hub__refresh" onClick={() => tab === 'docker' ? loadDocker() : loadWsl()}
              title="Refresh">
              <VscRefresh className={loading ? 'env-hub__spin' : ''} />
            </button>
          </div>

          {tab === 'docker' && (
            <div className="env-hub__list">
              {dockerError && <div className="dialog__error">{dockerError}</div>}
              {containers.map((c) => (
                <div key={c.id} className="env-hub__item">
                  <VscCircleFilled className={`env-hub__status env-hub__status--${c.state === 'running' ? 'running' : 'stopped'}`} />
                  <div className="env-hub__item-info">
                    <div className="env-hub__item-name">{c.name}</div>
                    <div className="env-hub__item-detail">{c.image} — {c.status}</div>
                  </div>
                  <button className="dialog__btn dialog__btn--primary env-hub__connect-btn"
                    disabled={c.state !== 'running'}
                    onClick={() => { onConnectDocker(c.id, c.name); onClose(); }}>
                    <VscPlay /> Attach
                  </button>
                </div>
              ))}
              {containers.length === 0 && !dockerError && (
                <div className="env-hub__empty">No Docker containers found. Is Docker running?</div>
              )}
            </div>
          )}

          {tab === 'wsl' && (
            <div className="env-hub__list">
              {wslError && <div className="dialog__error">{wslError}</div>}
              {distros.map((d) => (
                <div key={d.name} className="env-hub__item">
                  <VscCircleFilled className={`env-hub__status env-hub__status--${d.state === 'Running' ? 'running' : 'stopped'}`} />
                  <div className="env-hub__item-info">
                    <div className="env-hub__item-name">
                      {d.name}
                      {d.is_default && <span className="env-hub__default-badge">default</span>}
                    </div>
                    <div className="env-hub__item-detail">WSL {d.version} — {d.state}</div>
                  </div>
                  <button className="dialog__btn dialog__btn--primary env-hub__connect-btn"
                    onClick={() => { onConnectWsl(d.name); onClose(); }}>
                    <VscPlay /> Connect
                  </button>
                </div>
              ))}
              {distros.length === 0 && !wslError && (
                <div className="env-hub__empty">No WSL distributions found.</div>
              )}
            </div>
          )}
        </div>
        <div className="dialog__footer">
          <button className="dialog__btn dialog__btn--secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentHub;
