import { useCallback, useState } from 'react';
import {
  loadDeviceModel,
  saveDeviceModel,
  type DeviceModelId,
} from '@/core/deviceModel';

/** Remembered choice of which GP-200 variant the user has in front of them. */
export function useDeviceModel(): {
  deviceModel: DeviceModelId;
  setDeviceModel: (id: DeviceModelId) => void;
} {
  const [deviceModel, setModel] = useState<DeviceModelId>(() => loadDeviceModel());

  const setDeviceModel = useCallback((id: DeviceModelId) => {
    setModel(id);
    saveDeviceModel(id);
  }, []);

  return { deviceModel, setDeviceModel };
}
