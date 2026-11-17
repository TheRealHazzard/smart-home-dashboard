/**
 * @typedef {"hue"|"tapo"|"nanoleaf"} Vendor
 *
 * @typedef {Object} DeviceState
 * @property {boolean} online
 * @property {boolean} [on]
 * @property {number} [brightness]  0-100
 * @property {number} [mireds]      white color temperature, if capable
 * @property {{hue:number, sat:number}} [color]  hue 0-360, sat 0-100
 * @property {string} [error]
 *
 * @typedef {Object} Device
 * @property {string} id            "<vendor>:<vendorNativeId>"
 * @property {string} name
 * @property {Vendor} vendor
 * @property {string[]} capabilities  subset of ["power","brightness","color","colorTemp"]
 * @property {DeviceState} state
 *
 * Every adapter module exposes:
 *   listDevices(): Promise<Device[]>
 *   setPower(nativeId, on: boolean): Promise<DeviceState>
 *   setBrightness(nativeId, pct: number): Promise<DeviceState>
 *   setColor(nativeId, { hue, sat } | { mireds }): Promise<DeviceState>
 *
 * Adapters must catch their own vendor errors and return
 * { online: false, error } rather than throwing, so one device or vendor
 * outage never breaks GET /api/devices for everything else.
 */

export {};
