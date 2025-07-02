export class EnergyCalculator {
  static carProfiles = [
    {
      name: "Tesla Model Y",
      batteryCapacityWh: 60000,
      maxPower: 250000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 30) return 250000;
        if (soc < 60) return 250000 - ((soc - 30) / 30) * (250000 - 120000);
        if (soc < 80) return 120000 - ((soc - 60) / 20) * (120000 - 60000);
        if (soc < 100) return 60000 - ((soc - 80) / 20) * (60000 - 20000);
        return 0;
      },
    },
    {
      name: "Volkswagen ID.4",
      batteryCapacityWh: 77000,
      maxPower: 135000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 40) return 135000;
        if (soc < 80) return 135000 - ((soc - 40) / 40) * (135000 - 60000);
        if (soc < 100) return 60000 - ((soc - 80) / 20) * (60000 - 20000);
        return 0;
      },
    },
    {
      name: "Renault Zoe",
      batteryCapacityWh: 52000,
      maxPower: 50000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 80) return 50000;
        if (soc < 100) return 50000 - ((soc - 80) / 20) * (50000 - 22000);
        return 0;
      },
    },
    {
      name: "Fiat 500e",
      batteryCapacityWh: 42000,
      maxPower: 85000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 50) return 85000;
        if (soc < 80) return 85000 - ((soc - 50) / 30) * (85000 - 35000);
        if (soc < 100) return 35000 - ((soc - 80) / 20) * (35000 - 15000);
        return 0;
      },
    },
    {
      name: "Hyundai Kona Electric",
      batteryCapacityWh: 64000,
      maxPower: 77000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 60) return 77000;
        if (soc < 80) return 77000 - ((soc - 60) / 20) * (77000 - 40000);
        if (soc < 100) return 40000 - ((soc - 80) / 20) * (40000 - 15000);
        return 0;
      },
    },
    {
      name: "Kia e-Niro",
      batteryCapacityWh: 64000,
      maxPower: 77000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 60) return 77000;
        if (soc < 80) return 77000 - ((soc - 60) / 20) * (77000 - 40000);
        if (soc < 100) return 40000 - ((soc - 80) / 20) * (40000 - 15000);
        return 0;
      },
    },
    {
      name: "Peugeot e-208",
      batteryCapacityWh: 50000,
      maxPower: 100000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 80) return 100000;
        if (soc < 100) return 100000 - ((soc - 80) / 20) * (100000 - 22000);
        return 0;
      },
    },
    {
      name: "Cupra Born",
      batteryCapacityWh: 58000,
      maxPower: 120000,
      voltage: 400,
      chargingCurve: (soc) => {
        if (soc < 40) return 120000;
        if (soc < 80) return 120000 - ((soc - 40) / 40) * (120000 - 40000);
        if (soc < 100) return 40000 - ((soc - 80) / 20) * (40000 - 20000);
        return 0;
      },
    },
    {
      name: "Porsche Taycan",
      batteryCapacityWh: 93000,
      maxPower: 270000,
      voltage: 800,
      chargingCurve: (soc) => {
        if (soc < 30) return 270000;
        if (soc < 60) return 270000 - ((soc - 30) / 30) * (270000 - 150000);
        if (soc < 80) return 150000 - ((soc - 60) / 20) * (150000 - 60000);
        if (soc < 100) return 60000 - ((soc - 80) / 20) * (60000 - 20000);
        return 0;
      },
    },
  ];

  static generateSessionSamples(
    carName,
    soc,
    intervalSeconds = 60
  ) {
    const car = this.carProfiles.find((c) => c.name === carName);

    if (!car) throw new Error("Car profile not found");

    let energy = (soc / 100) * car.batteryCapacityWh;
    let timestamp = new Date();

    const power = car.chargingCurve(soc);
    const voltage = car.voltage;
    const current = power / voltage;
    const energyAdded = (power * intervalSeconds) / 3600; // Wh
    energy += energyAdded;
    var newSoc = Math.min(100, (energy / car.batteryCapacityWh) * 100);
    timestamp = new Date(timestamp.getTime() + intervalSeconds * 1000);

    return {
      soc: Math.round(newSoc),
      power: Math.round(power),
      current: Math.round(current),
      voltage,
      energy: Math.round(energy),
      timestamp: new Date(timestamp),
    };
  }

  static getCarNames() {
    return this.carProfiles.map((c) => c.name);
  }
}
