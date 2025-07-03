import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { FormGroup, Typography, Paper, Box, Divider, Grid, Chip, Button, Tooltip, TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { connectorData, connectorStatus, stopReason, connectors} from '../../common/constants';
import { sendCommand } from '../../OCPP/OCPP-Commands';
import { mainStatus } from '../../Config/charge-point-settings';
import { styled } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import { EnergyCalculator } from '../../Util/EnergyCalculator';

const animate = '../arrows.gif'

const StyledTextField = styled(TextField)({
  '& .MuiOutlinedInput-root': {
    '& fieldset': {
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
    },
  },
});

const StyledButton = styled(Button)({  
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  width: 40,
  minWidth: 40,
  maxHeight: 40,
  padding: 6,
  '& .MuiButton-startIcon': { margin: 0 }
});

const carOptions = EnergyCalculator.getCarNames();

const Connector = ({ id, status, centralSystemSend, settings, setSettings }) => {
  const [ meterError, setMeterError ] = useState(false)
  const [ localStatus, setLocalStatus ] = useState(connectorStatus.Available)
  const [ autoMetering, setAutoMetering ] = useState(false)
  const [ selectedCar, setSelectedCar ] = useState(carOptions[0]);
  const [ lastSessionSample, setLastSessionSample ] = useState(null);
  const intervalRef = useRef(null)

  const updateData = (field, data) => {
    if (field === 'currentMeterValue') {
      data = Number(data)
      if(isNaN(data) || !Number.isInteger(data)) return
      const startValue = settings.startMeterValue
      startValue > data ? setMeterError(true) : setMeterError(false)
    }

    connectors[id] = { ...connectors[id], [field]: data }
    setSettings(connectors[id])
  }

  const sendRequest = (command) => {
    const metaData = {}
    switch (command) {
      case 'StatusNotification':
        connectors[id] = { ...connectors[id], status: localStatus }
        setSettings(connectors[id])
        metaData.connectorId = id
        metaData.status = connectors[id].status
        break;
      case 'StartTransaction':
        metaData.connectorId = id
        metaData.idTag = connectors[id].idTag
        metaData.startMeterValue = connectors[id].startMeterValue
        break;
      case 'StopTransaction':
        metaData.connectorId = id
        metaData.currentMeterValue = connectors[id].currentMeterValue
        metaData.transactionId = connectors[id].transactionId
        metaData.stopReason = connectors[id].stopReason
      case 'MeterValues':
        const initialSoc = lastSessionSample?.initialSoc ?? Math.floor(Math.random() * (22 - 3 + 1)) + 3;
        const sessionSample = EnergyCalculator.generateSessionSamples(
          selectedCar,
          initialSoc,
          lastSessionSample?.soc ?? initialSoc,
          connectors[id].currentMeterValue,
          connectors[id].startMeterValue,
          30,
        );

        console.log(`Generated session sample for connector ${id}:`, sessionSample);

        // Use the last sample for display
        const sample = Array.isArray(sessionSample) ? sessionSample[sessionSample.length - 1] : sessionSample;
        setLastSessionSample(sample);
        updateData('currentMeterValue', sample.energy);
       
        metaData.connectorId = connectors[id].connectorId
        metaData.transactionId = connectors[id].transactionId
        metaData.initialSoc = sample.initialSoc
        metaData.soc = sample.soc
        metaData.current = sample.current
        metaData.power = sample.power
        metaData.voltage = sample.voltage
        metaData.currentMeterValue = sample.energy
        metaData.timestamp = sample.timestamp
        break;
      default:
        break;
    }
    const result = sendCommand(command, metaData)
    centralSystemSend(result.ocppCommand, result.lastCommand)
  }

  // Auto metering effect
  useEffect(() => {
    if (autoMetering && settings.inTransaction) {
      intervalRef.current = setInterval(() => {
        sendRequest('MeterValues');
      }, 30000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    // Cleanup on unmount or when autoMetering/settings.inTransaction changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoMetering, settings.inTransaction, settings.currentMeterValue])

  // Stop auto metering if transaction ends
  useEffect(() => {
    if (!settings.inTransaction && autoMetering) {
      setAutoMetering(false)
      setLastSessionSample(null)
      // Set connector status to Available after a random delay (4-23s)
      setTimeout(() => {
        setLocalStatus(connectorStatus.Available);
        sendRequest('StatusNotification');
      }, (Math.floor(Math.random() * 20) + 4) * 1000);
    }

    if(settings.inTransaction) {
      setSelectedCar(carOptions[Math.floor(Math.random() * carOptions.length)])
      setAutoMetering(true)
      console.log(`Transaction started on connector ${id} with car: ${selectedCar}`);
    }
  }, [settings.inTransaction])

  return (
    <Paper sx={{p: 2}}>
    <Box display='flex' alignItems='center' justifyContent='space-between'>
      <Typography variant='h6' color='primary'>CONNECTOR - {id}</Typography>
      { settings.inTransaction
        ? <Tooltip placement='top' title='In Transaction' arrow><img src={animate} style={{height: 10}} alt='charge animation' /></Tooltip>
        : null
      }
      <Chip
          size='small'
          label={connectorData[settings.status].text.toUpperCase()}
          sx={{ backgroundColor: connectorData[settings.status].backgroundColor, color: connectorData[settings.status].color}}
        />
    </Box>
    <Divider sx={{ mt: 0.5, mb: 1.5 }} />
    <Grid container spacing={3}>
      <Grid item xs={6}>
        <TextField
          fullWidth
          disabled
          value={settings.idTag}
          label='ID Tag'
          size='small'
        />
      </Grid>
      <Grid item xs={6}>
        <Button
          fullWidth
          variant='contained'
          disabled={settings.inTransaction || status.status !== mainStatus.authorized}
          onClick={() => sendRequest('StartTransaction')}
        >
          Start transaction
        </Button>
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth>
          <InputLabel>Stop Reason</InputLabel>
          <Select
            fullWidth
            value={settings.stopReason}
            label='Stop Reason'
            size='small'
            disabled={!settings.inTransaction}
            name='stopReason'
            onChange={(e) => updateData(e.target.name, e.target.value)}
          >
            { Object.keys(stopReason).map(x => <MenuItem key={x} value={stopReason[x]}>{stopReason[x]}</MenuItem>) }
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={6}>
        <Button fullWidth variant='contained' disabled={!settings.inTransaction} onClick={() => sendRequest('StopTransaction')} > stop transaction </Button>
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth>
          <InputLabel>Status</InputLabel>
          <Select
            fullWidth
            value={localStatus}
            label='Status'
            size='small'
            name='status'
            onChange={(e) => setLocalStatus(e.target.value)}
          >
            { Object.keys(connectorStatus).map(x => <MenuItem key={x} value={connectorStatus[x]}>{connectorData[x].text}</MenuItem>) }
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={6}>
        <Button fullWidth variant='contained' onClick={() => sendRequest('StatusNotification')}>status notification</Button>
      </Grid>
      <Grid item xs={6}>
        <TextField label='Start Meter Value' size='small' variant='outlined' fullWidth value={settings.startMeterValue} disabled />
      </Grid>
      <Grid item xs={6}>
        <FormGroup row>
          <StyledTextField
            disabled={!settings.inTransaction}
            label='Current Meter Value'
            size='small'
            error={meterError}
            variant='outlined'
            sx={{ width: 'calc(100% - 40px)'}}
            value={settings.currentMeterValue}
            name='currentMeterValue'
            onChange={(e) => updateData(e.target.name, e.target.value)}
            onFocus={event => {event.target.select()}}
          />
          <StyledButton
            disabled={!settings.inTransaction}
            variant='contained'
            startIcon={<AddIcon />}
            onClick={() => updateData('currentMeterValue', settings.currentMeterValue + 10)}
          />
        </FormGroup>
      </Grid>
      <Grid item xs={6}>
        <Button
          fullWidth
          variant={autoMetering ? 'outlined' : 'contained'}
          color={autoMetering ? 'secondary' : 'primary'}
          disabled={!settings.inTransaction}
          onClick={() => setAutoMetering((prev) => !prev)}
        >
          {autoMetering ? 'Stop Auto Meter' : 'Start Auto Meter'}
        </Button>
      </Grid>
      <Grid item xs={6}>
        <FormControl fullWidth>
          <InputLabel>Car</InputLabel>
          <Select
            value={selectedCar}
            label="Car"
            size="small"
            onChange={e => setSelectedCar(e.target.value)}
            disabled={settings.inTransaction}
          >
            {carOptions.map(car => (
              <MenuItem key={car} value={car}>{car}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
      <Button disabled={!settings.inTransaction} fullWidth variant='contained' onClick={() => sendRequest('MeterValues')} >Send Meter Value</Button>
      </Grid>
      <Grid item xs={12}>
        {lastSessionSample && (
          <Box sx={{ mt: 2, mb: 2, p: 2, background: '#f5f5f5', borderRadius: 2 }}>
            <Typography variant="subtitle1" color="primary">Charging Data</Typography>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={4}><b>State of Charge:</b> {lastSessionSample.soc}%</Grid>
              <Grid item xs={6} sm={4}><b>Power:</b> {lastSessionSample.power} W</Grid>
              <Grid item xs={6} sm={4}><b>Current:</b> {lastSessionSample.current} A</Grid>
              <Grid item xs={6} sm={4}><b>Voltage:</b> {lastSessionSample.voltage} V</Grid>
              <Grid item xs={6} sm={4}><b>Energy:</b> {lastSessionSample.energy} Wh</Grid>
              <Grid item xs={6} sm={4}><b>Timestamp:</b> {lastSessionSample.timestamp.toLocaleString()}</Grid>
            </Grid>
          </Box>
        )}
      </Grid>
    </Grid>
  </Paper>
  )
}

Connector.propTypes = {
  id: PropTypes.number.isRequired,
  status: PropTypes.any.isRequired,
  centralSystemSend: PropTypes.func.isRequired,
  settings: PropTypes.object.isRequired,
  setSettings: PropTypes.func.isRequired,
};

export default Connector