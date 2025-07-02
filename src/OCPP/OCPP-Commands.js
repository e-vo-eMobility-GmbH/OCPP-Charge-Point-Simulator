import { getId, OCPPDate } from '../common/help-functions';


const metaDataType = {
  connectorId: 0,
  bootNotification: {},
  RFIDTag: null,
  status: null,
  idTag: null,
  meterStart: null,
  meterStop: null,
  currentMeterValue: null,
  diagnosticStatus: null,
  firmWareStatus: null,
}


/**
 * Send Command to OCPP Central System
 * @param { string } command 
 * @param { metaDataType } metaData
 */
export const sendCommand = (command, metaData) => {
  const id = getId()
  let message

  switch (command) {
    case 'Heartbeat':
      message = {}
      break;
    case 'BootNotification':
      message = metaData.bootNotification
      break;
    case 'Authorize':
      message = { idTag: metaData.RFIDTag }
      break;
    case 'StatusNotification':
      message = {
        connectorId: metaData.connectorId,
        status: metaData.status,
        errorCode: 'NoError',
        info: '',
        timestamp: OCPPDate(new Date()),
        vendorId: '',
        vendorErrorCode: ''
      }
      break;
    case 'StartTransaction':
      message = {
        connectorId: metaData.connectorId,
        idTag: metaData.idTag,
        meterStart: metaData.startMeterValue,
        timestamp: OCPPDate(new Date()),
        // reservationId: ''
      }
      break;
    case 'StopTransaction':
      message = {
        // idTag: '',
        meterStop: metaData.currentMeterValue,
        timestamp: OCPPDate(new Date()),
        transactionId: metaData.transactionId,
        reason: metaData.stopReason,
        // transactionData: ''
      }
      break;
    case 'MeterValues':
      const cars = [
        {
          name: 'Cupra Born',
          batteryCapacityWh: 58000,
          maxPower: 120000, // 120 kW
          voltage: 400,
          curve: soc => {
            if (soc < 40) return 120000;
            if (soc < 80) return 120000 - ((soc - 40) / 40) * (120000 - 40000);
            return 40000 - ((soc - 80) / 20) * (40000 - 20000);
          }
        },
        {
          name: 'MG ZSEV',
          batteryCapacityWh: 44000,
          maxPower: 76000, // 76 kW
          voltage: 400,
          curve: soc => {
            if (soc < 50) return 76000;
            if (soc < 80) return 76000 - ((soc - 50) / 30) * (76000 - 35000);
            return 35000 - ((soc - 80) / 20) * (35000 - 15000);
          }
        },
        {
          name: 'Tesla Model Y Facelift 2025',
          batteryCapacityWh: 60000,
          maxPower: 250000, // 250 kW
          voltage: 400,
          curve: soc => {
            if (soc < 30) return 250000;
            if (soc < 60) return 250000 - ((soc - 30) / 30) * (250000 - 120000);
            if (soc < 80) return 120000 - ((soc - 60) / 20) * (120000 - 60000);
            return 60000 - ((soc - 80) / 20) * (60000 - 20000);
          }
        },
        {
          name: 'Audi Q4 E-Tron',
          batteryCapacityWh: 77000,
          maxPower: 135000, // 135 kW
          voltage: 400,
          curve: soc => {
            if (soc < 40) return 135000;
            if (soc < 80) return 135000 - ((soc - 40) / 40) * (135000 - 60000);
            return 60000 - ((soc - 80) / 20) * (60000 - 20000);
          }
        },
        {
          name: 'Porsche Taycan',
          batteryCapacityWh: 93000,
          maxPower: 270000, // 270 kW
          voltage: 800,
          curve: soc => {
            if (soc < 30) return 270000;
            if (soc < 60) return 270000 - ((soc - 30) / 30) * (270000 - 150000);
            if (soc < 80) return 150000 - ((soc - 60) / 20) * (150000 - 60000);
            return 60000 - ((soc - 80) / 20) * (60000 - 20000);
          }
        }
      ];
        
      var car = cars[0];

      cars.forEach(element => {
        if(element.name === metaData.selectedCar) {
          car = element;
        }
      });

      // SoC calculation
      let soc = metaData.soc;
      const chargedWh = metaData.currentMeterValue - (metaData.startMeterValue || 0);
      if (typeof soc === 'undefined') {
        soc = Math.min(100, Math.max(0, Math.round((chargedWh / car.batteryCapacityWh) * 100)));
      }
      // Power curve for the selected car
      let power = car.curve(soc);
      // Station max is 300 kW
      power = Math.min(power, 300000);
      // Calculate current for the given voltage
      const current = Math.round(power / car.voltage);
      message = {
        connectorId: metaData.connectorId,
        transactionId: metaData.transactionId,
        meterValue: [
          {
            timestamp: OCPPDate(new Date()),
            sampledValue: [
              { measurand: 'Voltage', unit: 'V', value: car.voltage.toString() },
              { measurand: 'Current.Import', unit: 'A', value: current.toString() },
              { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: metaData.currentMeterValue.toString() },
              { measurand: 'Power.Active.Import', unit: 'W', value: Math.round(power).toString() },
              { measurand: 'SoC', unit: 'Percent', value: soc.toString() },
            ]
          }
        ]
      }
      break;
    case 'DiagnosticsStatusNotification':
      message = { status: metaData.diagnosticStatus }
      break;
    case 'FirmwareStatusNotification':
      message = { status: metaData.firmWareStatus }
      break;
    default:
      message = {}
      break;
  }

  return {
    ocppCommand: JSON.stringify([ 2, id, command, message ]),
    lastCommand: { id, command, connector: metaData.connectorId || metaDataType.connectorId }
  }
}