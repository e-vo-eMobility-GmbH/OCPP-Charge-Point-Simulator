import { nanoid } from "nanoid"
import stationSettings from './station-config'

const defaultSettings = {
  mainSettings: {
    protocol: "ws",
    address: "127.0.0.1",
    port: "9099/ocpp/1.6/json/evo/",
    chargePointId: "00000001111",
    OCPPversion: "ocpp1.6",
    RFIDTag: nanoid(20),
    numberOfConnectors: 2,
    autoReconnect: true, // Enable auto reconnect by default
  },

  bootNotification: {
    chargePointVendor: 'Elmo',
    chargePointModel: 'Elmo-Virtual1',
    chargePointSerialNumber: 'elm.001.13.1',
    chargeBoxSerialNumber: 'elm.001.13.1.01',
    firmwareVersion: '0.9.87',
    iccid: '',
    imsi: '',
    meterType: 'ELM NQC-ACDC',
    meterSerialNumber: 'elm.001.13.1.01'
  },

  stationSettings: stationSettings.configurationKey,

  simulation: {
    diagnosticFileName: 'diagnostics.csv',
    diagnosticUploadTime: 30, // in seconds
    diagnosticStatus: 'Uploaded',
    firmWareStatus: 'Downloaded',
    connectorOneUnlock: 'Unlocked',
    connectorTwoUnlock: 'Unlocked',
  }
}

export default defaultSettings
