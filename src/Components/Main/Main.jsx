import React, { useEffect, useContext, useState, useRef } from "react";
import { Container, Box, Typography, Tooltip, Divider, Grid, Paper, Stack , Popover} from '@mui/material'
import ChargePoint from '../ChargePoint/ChargePoint'
import moment from "moment";
import Connector from "../Connector/Connector";
import SettingsContext from '../../Context/SettingsContext';
import { pointStatus, connectedStatuses } from '../../Config/charge-point-settings';
import { MonitorHeartOutlined, Speed, Clear } from "@mui/icons-material";
import { logTypes, commands, connectors, connectorStatus, socketInfo } from "../../common/constants";
import { sendCommand } from "../../OCPP/OCPP-Commands";

const MAX_RECONNECT_ATTEMPTS = 15
const RECONNECT_INTERVAL = 15000 // 15 seconds

const getTime = () => moment().format('HH:mm:ss')


const Main = () => {
  const { settingsState, setSettingsState } = useContext(SettingsContext)
  
  const [ ws, setWs ] = useState(socketInfo.webSocket || '')
  const [ logs, setLogs ] = useState([])
  const [ status, setStatus ] = useState(socketInfo.lastStatus || pointStatus.disconnected)
  const [ conOne, setConOne ] = useState(connectors[1])
  const [ conTwo, setConTwo ] = useState(connectors[2])
  const [ isReconnecting, setIsReconnecting ] = useState(false)

  const [ uploading, setUploading ] = useState(false)
  const [ seconds, setSeconds ] = useState(settingsState.simulation.diagnosticUploadTime)
  const [ initialBootNotification, setInitialBootNotification ] = useState(false)
  const [ helpAnchorEl, setHelpAnchorEl ] = useState(null)
  const [ helpText, setHelpText ] = useState('')

  const heartbeatIntervalRef = useRef(null)
  const meterValueIntervalRef = useRef({ 1: null, 2: null })
  const uploadIntervalRef = useRef(null)
  const uploadSecondsRef = useRef(settingsState.simulation.diagnosticUploadTime)
  const reconnectIntervalRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const logArrayRef = useRef([])
  const settingsStateRef = useRef(settingsState)
  const isReconnectingRef = useRef(false)
  settingsStateRef.current = settingsState
  isReconnectingRef.current = isReconnecting

  const updateConnector = {
    1: setConOne,
    2: setConTwo,
  }
  
  const open = Boolean(helpAnchorEl);

  const logsEndRef = useRef(null)
  const scrollToBottom = () => logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  useEffect(() => { scrollToBottom() }, [logs])

  const showHelpText = (event, type) => {
    const getData = (settingsState.stationSettings.filter(x => x.key === type))[0]
    setHelpText(`${type} set to ${getData.value} seconds`)
    setHelpAnchorEl(event.target)
  }


  const updateLog = (record) => {
    logArrayRef.current.push(record)
    setLogs([ ...logArrayRef.current])
  }


  const clearLog = () => {
    logArrayRef.current.length = 0
    setLogs([])
  }


  const uploadSimulate = async () => {
    if (uploadSecondsRef.current === 0) {
      const result = await sendCommand('DiagnosticsStatusNotification', { diagnosticStatus: settingsStateRef.current.simulation.diagnosticStatus })
      centralSystemSend(result.ocppCommand, result.lastCommand)
      clearInterval(uploadIntervalRef.current)
      setUploading(false)
      return
    }
    uploadSecondsRef.current = uploadSecondsRef.current - 1
    setSeconds(uploadSecondsRef.current)
  }

  const startConnection = () => {
    const { protocol, address, port, chargePointId, OCPPversion } = settingsStateRef.current.mainSettings
    socketInfo.webSocket = new WebSocket(`${protocol}://${address}:${port}/${chargePointId}`, [ OCPPversion ])
    setWs(socketInfo.webSocket)
    setStatus(pointStatus.connecting)
    updateLog({ time: getTime(), type: logTypes.socket, message: 'Attempting connection...' })
  }

  const attemptReconnect = () => {
    if (!settingsStateRef.current.mainSettings.autoReconnect || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        updateLog({ time: getTime(), type: logTypes.error, message: `Reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts` })
      }
      setIsReconnecting(false)
      clearInterval(reconnectIntervalRef.current)
      reconnectAttemptsRef.current = 0
      return
    }

    reconnectAttemptsRef.current++
    updateLog({ time: getTime(), type: logTypes.socket, message: `Reconnection attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}` })
    startConnection()
  }

  // Handle auto reconnect with useEffect
  useEffect(() => {
    if (!ws && settingsState.mainSettings.autoReconnect && !isReconnecting) {
      setIsReconnecting(true)
      reconnectAttemptsRef.current = 0
      clearInterval(reconnectIntervalRef.current)
      reconnectIntervalRef.current = setInterval(attemptReconnect, RECONNECT_INTERVAL)
      return () => {
        clearInterval(reconnectIntervalRef.current)
        reconnectIntervalRef.current = null
      }
    }
  }, [ws, settingsState.mainSettings.autoReconnect])

  // Listen for connect event from ChargePoint component
  useEffect(() => {
    const handleConnectEvent = () => {
      // Clear any existing reconnect intervals when manually connecting
      clearInterval(reconnectIntervalRef.current)
      reconnectAttemptsRef.current = 0
      setIsReconnecting(false)
      startConnection()
    }
    
    window.addEventListener('ocpp-connect', handleConnectEvent)
    
    return () => {
      window.removeEventListener('ocpp-connect', handleConnectEvent)
    }
  }, []) // Only mount/dismount once


  const centralSystemSend = (command, localCommand) => {
    ws.send(command)
    commands.push(localCommand)
    updateLog({ time: getTime(), type: logTypes.send, command: localCommand.command, message: command })
  }


  const incomingMessage = async (id, message) => {
    const getCommand = (commands.filter(x => x.id === id))[0]

    if (!getCommand) {
      updateLog( { time: getTime(), type: logTypes.error, message: 'Cannot recognize command!' })
      return
    }

    const { command, connector } = getCommand
    updateLog({ time: getTime(), type: logTypes.message, command, message: JSON.stringify(message) })
    
    if (command === 'BootNotification' && !initialBootNotification && message.status === 'Accepted') {
      // Send first heartbeat
      const result = await sendCommand('Heartbeat', {})
      centralSystemSend(result.ocppCommand, result.lastCommand)

      // Send connector(s) status(es)
      for (let i = 1; i <= settingsStateRef.current.mainSettings.numberOfConnectors; i++) {
        const currentConnector = await sendCommand('StatusNotification', { connectorId: i, status: connectors[i].status })
        centralSystemSend(currentConnector.ocppCommand, currentConnector.lastCommand)
      }

      // Set initial boot to complete
      setInitialBootNotification(true)

      // Set heartbeat interval
      const index = settingsStateRef.current.stationSettings.findIndex(x => x.key === 'HeartbeatInterval')
      const updatedSettings = { ...settingsStateRef.current }
      updatedSettings.stationSettings[index] = { ...updatedSettings.stationSettings[index], value: message.interval }
      setSettingsState(updatedSettings)
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = setInterval(() => {
        sendCommand('Heartbeat', {}).then(result => {
          centralSystemSend(result.ocppCommand, result.lastCommand)
        })
      }, message.interval * 1000)
    }

    if (command === 'Authorize' && message.idTagInfo.status === 'Accepted') {
      setStatus(pointStatus.authorized)
      socketInfo.lastStatus = pointStatus.authorized
    }

    if (command === 'StartTransaction' && message.idTagInfo.status === 'Accepted') {
      connectors[connector].transactionId = message.transactionId
      connectors[connector].inTransaction = true
      connectors[connector].status = connectorStatus.Charging
      updateConnector[connector]({ ...connectors[connector] })

      const index = settingsStateRef.current.stationSettings.findIndex(x => x.key === 'MeterValueSampleInterval')

      clearInterval(meterValueIntervalRef.current[connector])
      meterValueIntervalRef.current[connector] = setInterval(() => {
        connectors[connector].currentMeterValue = connectors[connector].currentMeterValue + 50
        updateConnector[connector]({ ...connectors[connector] })

        const metaData = {
          connectorId: connectors[connector].connectorId,
          transactionId: connectors[connector].transactionId,
          currentMeterValue: connectors[connector].currentMeterValue,
          ocmfSignedMeterValues: settingsStateRef.current.mainSettings.ocmfSignedMeterValues,
          ocmfPrivateKey: settingsStateRef.current.mainSettings.ocmfPrivateKey,
        }

        sendCommand('MeterValues', metaData).then(result => {
          centralSystemSend(result.ocppCommand, result.lastCommand)
        })
      }, settingsStateRef.current.stationSettings[index].value * 1000)

      const statusData = await sendCommand('StatusNotification', { connectorId: connector, status: connectors[connector].status })
      centralSystemSend(statusData.ocppCommand, statusData.lastCommand)
    }

    if (command === 'StopTransaction' && message.idTagInfo.status === 'Accepted') {
      connectors[connector].startMeterValue = connectors[connector].currentMeterValue
      connectors[connector].transactionId = 0
      connectors[connector].inTransaction = false
      connectors[connector].status = connectorStatus.Finishing
      updateConnector[connector]({ ...connectors[connector] })
      clearInterval(meterValueIntervalRef.current[connector])
      meterValueIntervalRef.current[connector] = null
      const statusData = await sendCommand('StatusNotification', { connectorId: connector, status: connectors[connector].status })
      centralSystemSend(statusData.ocppCommand, statusData.lastCommand)
    }
  }


  const incomingRequest = async (id, request, payload) => {
    const acceptRespond = JSON.stringify([ 3, id, { status: 'Accepted' }])
    const rejectRespond = JSON.stringify([ 3, id, { status: 'Rejected' }])
    updateLog({ time: getTime(), type: logTypes.request, command: request, message: JSON.stringify(payload) })

    let connId = payload.connectorId
    const metaData = {}

    switch (request) {
      case 'RemoteStartTransaction':
        if (connectors[connId].inTransaction) {
          ws.send(rejectRespond)
          return
        }

        ws.send(acceptRespond)
        connectors[connId].idTag = payload.idTag
        updateConnector[connId]({ ...connectors[connId] })

        metaData.connectorId = connId
        metaData.idTag = connectors[connId].idTag
        metaData.startMeterValue = connectors[connId].startMeterValue
        connectors[connId].startTimestamp = new Date()
        metaData.startTimestamp = connectors[connId].startTimestamp
        metaData.ocmfSignedMeterValues = settingsStateRef.current.mainSettings.ocmfSignedMeterValues
        metaData.ocmfPrivateKey = settingsStateRef.current.mainSettings.ocmfPrivateKey
        const newTransaction = await sendCommand('StartTransaction', metaData)
        centralSystemSend(newTransaction.ocppCommand, newTransaction.lastCommand)
        break;
      case 'RemoteStopTransaction':
          connId = null
          for (let i = 1; i <= settingsStateRef.current.mainSettings.numberOfConnectors; i++) {
            if (connectors[i].transactionId === payload.transactionId) connId = i
          }

        if (!connId) {
          ws.send(rejectRespond)
          return
        }

        ws.send(acceptRespond)
        metaData.connectorId = connId
        metaData.currentMeterValue = connectors[connId].currentMeterValue
        metaData.transactionId = connectors[connId].transactionId
        metaData.stopReason = connectors[connId].stopReason
        metaData.startMeterValue = connectors[connId].startMeterValue && 0
        metaData.startTimestamp = connectors[connId].startTimestamp
        metaData.stopTimestamp = new Date()
        metaData.ocmfSignedMeterValues = settingsStateRef.current.mainSettings.ocmfSignedMeterValues
        metaData.ocmfPrivateKey = settingsStateRef.current.mainSettings.ocmfPrivateKey
        // Set this flag to send one or two signed meter values
        metaData.withSignedStartMeterValue = true
        const endTransaction = await sendCommand('StopTransaction', metaData)

        centralSystemSend(endTransaction.ocppCommand, endTransaction.lastCommand)
        break;
      case 'TriggerMessage':
        const { requestedMessage } = payload
        if (!connectors[connId].inTransaction && requestedMessage === 'MeterValues') {
          ws.send(rejectRespond)
          return
        }

        ws.send(acceptRespond)
        metaData.connectorId = connId
        metaData.transactionId = connectors[connId].transactionId
        metaData.currentMeterValue = connectors[connId].currentMeterValue
        metaData.status = connectors[connId].status
        metaData.bootNotification = settingsStateRef.current.bootNotification
        metaData.diagnosticStatus = uploading ? 'Uploading' : 'Idle'
        metaData.firmWareStatus = settingsStateRef.current.simulation.firmWareStatus
        const triggerMessage = await  sendCommand(requestedMessage, metaData)
        centralSystemSend(triggerMessage.ocppCommand, triggerMessage.lastCommand)
        break;
      case 'UnlockConnector':
        const getSetting = settingsStateRef.current.stationSettings.findIndex(x => x.key === 'UnlockConnectorOnEVSideDisconnect')
        if (getSetting === -1 || settingsStateRef.current.stationSettings[getSetting].value === false) {
          ws.send(JSON.stringify([ 3, id, { status: 'NotSupported' }]))
          return
        }

        ws.send(JSON.stringify([ 3, id, { status: connId === 1 ? settingsStateRef.current.simulation.connectorOneUnlock : settingsStateRef.current.simulation.connectorTwoUnlock }]))
        break;
      case 'GetConfiguration':
        const returnConfiguration = { configurationKey: settingsStateRef.current.stationSettings, unknownKey: [] }
        ws.send(JSON.stringify([ 3, id, returnConfiguration]))
        break;
      case 'ChangeConfiguration':
        const { key, value } = payload
        let changeValueStatus = 'Accepted'
        const findSetting = settingsStateRef.current.stationSettings.findIndex(x => x.key === key)
        if (findSetting === -1) changeValueStatus = 'NotSupported'

        const checkSetting = settingsStateRef.current.stationSettings[findSetting]
        if (checkSetting.readonly) changeValueStatus = 'Rejected'
        if ((checkSetting.value === 'true' || checkSetting.value === 'false') && value !== 'true' && value !== 'false') changeValueStatus = 'Rejected'
        if (!isNaN(checkSetting.value) && isNaN(value)) changeValueStatus = 'Rejected'
        
        ws.send(JSON.stringify([ 3, id, { status: changeValueStatus }]))

        const element = { ...checkSetting, value }
        const updatedSettings = { ...settingsStateRef.current }
        updatedSettings.stationSettings[findSetting] = element
        setSettingsState(updatedSettings)
        break;
      case 'GetDiagnostics':
        ws.send(JSON.stringify([ 3, id, { fileName: settingsStateRef.current.simulation.diagnosticFileName }]))
        if (!uploading) {
          clearInterval(uploadIntervalRef.current)
          setUploading(true)
          uploadSecondsRef.current = settingsStateRef.current.simulation.diagnosticUploadTime
          setSeconds(uploadSecondsRef.current)
          uploadIntervalRef.current = setInterval(() => { uploadSimulate() }, 1000)
          const result = await  sendCommand('DiagnosticsStatusNotification', { diagnosticStatus: 'Uploading' })
          centralSystemSend(result.ocppCommand, result.lastCommand)
        }
        break;
      default:
        break;
    }
  }


  // Set up WebSocket event handlers inside useEffect for proper lifecycle management
  useEffect(() => {
    if (!ws) return

    const handleOpen = async () => {
      setStatus(pointStatus.connected)
      socketInfo.lastStatus = pointStatus.connected
      updateLog({ time: getTime(), type: logTypes.socket, message: 'Charge point connected' })

      reconnectAttemptsRef.current = 0
      setIsReconnecting(false)
      clearInterval(reconnectIntervalRef.current)

      const initialBoot = await sendCommand('BootNotification', { bootNotification: settingsStateRef.current.bootNotification })
      centralSystemSend(initialBoot.ocppCommand, initialBoot.lastCommand)
    }

    const handleClose = (event) => {
      let status = pointStatus.disconnected
      if (event.code === 1006) {
        updateLog( { time: getTime(), type: logTypes.error, message: 'Connection problem' })
        status = pointStatus.error
      } else {
        updateLog({ time: getTime(), type: logTypes.socket, message: 'Charge point disconnected' })
      }
      clearInterval(heartbeatIntervalRef.current)
      clearInterval(meterValueIntervalRef.current[1])
      clearInterval(meterValueIntervalRef.current[2])
      setInitialBootNotification(false)
      setStatus(status)
      setUploading(false)      
      clearInterval(uploadIntervalRef.current)
      setWs('')

      // Start auto reconnect if enabled
      if (settingsStateRef.current.mainSettings.autoReconnect && !isReconnectingRef.current) {
        setIsReconnecting(true)
        reconnectAttemptsRef.current = 0
        clearInterval(reconnectIntervalRef.current)
        updateLog({ time: getTime(), type: logTypes.socket, message: `Auto reconnect enabled. Will attempt reconnection in ${RECONNECT_INTERVAL/1000} seconds.` })
        reconnectIntervalRef.current = setInterval(attemptReconnect, RECONNECT_INTERVAL)
      }
    }

    const handleMessage = async (msg) => {
      const [ type, id, message, payload ] = JSON.parse(msg.data)
      switch (type) {
        case 2:
          await incomingRequest(id, message, payload)
          break;
        case 3:
          await incomingMessage(id, message)
          break;
        default:
          break;
      }
    }

    ws.onopen = handleOpen
    ws.onclose = handleClose
    ws.onmessage = handleMessage

    return () => {
      ws.onopen = null
      ws.onclose = null
      ws.onmessage = null
    }
  }, [ws])

  return (
    <Container sx={{maxWidth: '1366px !important'}}>
      <Grid container spacing={3}>
        <Grid item xs={3.2}>
          <ChargePoint ws={ws} setWs={setWs} status={status} setStatus={setStatus} centralSystemSend={centralSystemSend} />
          {
            uploading
              ? <Paper sx={{mt: 3, p: 2, height: '42.5px'}}>
                  <Box display='flex' alignItems='center'>
                    <img src='./sand.png' alt='upload animation' height={36} />
                    <Typography variant='body2' ml={1} color='primary' >SIMULATE UPLOAD DIAGNOSTICS FILE</Typography>
                    <Typography variant='h5' ml={0.5} color='primary' >{seconds > 9 ? seconds : `0${seconds}`}</Typography>
                    <Typography variant='bod1' ml={0.5} color='primary' >sec.</Typography>
                  </Box>
                </Paper>
              : null
          }
        </Grid>
        <Grid item xs={4.4}>
        { connectedStatuses.includes(status.status)
          ? <Connector id={1} status={status} centralSystemSend={centralSystemSend} settings={conOne} setSettings={setConOne} ocmfSignedMeterValues={settingsState.mainSettings.ocmfSignedMeterValues} ocmfPrivateKey={settingsState.mainSettings.ocmfPrivateKey} />
          : null
        }
        </Grid>
        <Grid item xs={4.4}>
          { settingsState.mainSettings.numberOfConnectors === 2 && connectedStatuses.includes(status.status)
            ? <Connector id={2} status={status} centralSystemSend={centralSystemSend} settings={conTwo} setSettings={setConTwo}  ocmfSignedMeterValues={settingsState.mainSettings.ocmfSignedMeterValues} ocmfPrivateKey={settingsState.mainSettings.ocmfPrivateKey} />
            : null
          }
        </Grid>
        <Grid item xs={12}>
          <Paper sx={{p: 2}}>
            <Box display='flex' justifyContent='space-between' alignContent='center'>
              <Typography variant='h6' color='primary'>LOG</Typography>
              <Box display='flex' justifyContent='flex-end' alignContent='center'>
                {isReconnecting && (
                  <Typography variant='body2' color='info.main' sx={{ mr: 2 }}>
                    Auto reconnect: {reconnectAttemptsRef.current}/{MAX_RECONNECT_ATTEMPTS}
                  </Typography>
                )}
                <Speed sx={{ml: 1, cursor: 'pointer'}} color='primary' onClick={(event) => showHelpText(event, 'MeterValueSampleInterval')} />
                <MonitorHeartOutlined sx={{ml: 1, cursor: 'pointer'}} color='primary' onClick={(event) => showHelpText(event, 'HeartbeatInterval')} />
                <Tooltip title='Clear log' placement='top' arrow >
                  <Clear sx={{ml: 1, cursor: 'pointer'}} color='primary' onClick={clearLog} />
                </Tooltip>
              </Box>
            </Box>
            <Divider sx={{ mt: 0.5, mb: 1.5 }} />
            <Stack spacing={1} height={340} maxHeight={295} sx={{ overflowY: 'scroll', fontSize: 14 }}>
            {
              logs.map((el, index) => (
                <Stack key={index} direction="row" color={el.type.color} spacing={2} divider={<Divider orientation="vertical" flexItem />}>
                  <Box>{el.time}</Box> 
                  <Box width={55} minWidth={55}>{el.type.text}</Box>
                  <Box width={175} minWidth={175}>{el.command}</Box>
                  <Box>{el.message}</Box>
                </Stack>)
              )
            }
            <Box ref={logsEndRef} />
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <Popover
        open={open}
        anchorEl={helpAnchorEl}
        onClose={() => setHelpAnchorEl(null)}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Typography sx={{ p: 2, backgroundColor: 'black', color: 'white' }}>{helpText}</Typography>
      </Popover>
    </Container>
  )
}


export default Main