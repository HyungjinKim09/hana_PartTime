type CameraDevice = {deviceId:string;label:string};

// A generic "wide" camera is usually the main lens. Never infer focal length
// from device order or from the track's digital zoom range.
export function isUltraWideCamera(label:string):boolean {
  return !/front|user|전면|앞면|selfie|facetime/i.test(label)
    && /ultra[\s_-]*wide|초광각|0[.,][56]\s*[x×배]/i.test(label);
}

export function preferredCamera(devices:CameraDevice[],remembered:string):string {
  return devices.find(device=>device.deviceId===remembered)?.deviceId
    || devices.find(device=>isUltraWideCamera(device.label))?.deviceId || '';
}
