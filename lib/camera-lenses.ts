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

export function quickRearLenses(devices:CameraDevice[]):CameraDevice[] {
  const ultra=devices.find(device=>isUltraWideCamera(device.label));
  const main=devices.find(({label})=>{
    if(isUltraWideCamera(label)||/front|user|전면|앞면|selfie|facetime|telephoto|망원|macro|접사|depth|심도|dual|triple|듀얼|트리플/i.test(label))return false;
    return /\b(?:back|rear)\s+(?:(?:main|wide)\s+)?camera\b|(?:후면|뒷면)\s*(?:(?:기본|광각)\s*)?카메라/i.test(label);
  });
  const magnification=ultra?.label.match(/0[.,]([56])\s*[x×배]/i)?.[1];
  return [
    ...(ultra?[{deviceId:ultra.deviceId,label:magnification?`0.${magnification}×`:'초광각'}]:[]),
    ...(main?[{deviceId:main.deviceId,label:'1×'}]:[]),
  ];
}
