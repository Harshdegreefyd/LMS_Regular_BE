export default function handleCounsellorSockets(socket, connectedCounsellors) {
  socket.on('counsellor-login', (data) => {
    const { counsellorId, role, name } = data;
    connectedCounsellors.set(counsellorId, {
      socketId: socket.id,
      role,
      name,
      online: true,
      idle: false,
      lastActivity: new Date(),
    });
    // console.log(connectedCounsellors)
  });

  socket.on('activity_status', (data) => {
       

    const { counsellorId, status, role, name, timestamp=new Date() } = data;
    const counsellor = connectedCounsellors.get(counsellorId);
    // console.log(`📊 Activity status received:`, { counsellorId, status, role, name, timestamp });
    // console.log
    if (counsellor) {
      counsellor.idle = status === 'idle';
      counsellor.lastActivity = new Date(timestamp || new Date());
      connectedCounsellors.set(counsellorId, counsellor);

      if (status === 'idle') {
        console.log(`😴 Counsellor went idle, notifying supervisors...`);
        notifySupervisorsOfIdleCounsellor(counsellorId, counsellor.name);
      }
    } else {
      console.warn(`⚠️ Counsellor not found: ${counsellorId}`);
    }
  });
   socket.on('counsellor-break', (data) => {
    const { counsellorId, name } = data;
    notifySupervisorsOfbreakCounsellor(counsellorId, name);
  });


  function notifySupervisorsOfIdleCounsellor(counsellorId, counsellorName) {
    console.log(`🔍 Looking for supervisors to notify about idle counsellor: ${counsellorName}`);

    let supervisorCount = 0;
    let notifiedCount = 0;

    for (const [id, userData] of connectedCounsellors.entries()) {
      if (userData.role === 'Supervisor') {
        supervisorCount++;
        const supervisorSocket = global.io.sockets.sockets.get(userData.socketId);

        console.log(`👨‍💼 Found supervisor: ${userData.name} (${id}) - Socket ID: ${userData.socketId}`);
        console.log(`🔌 Socket exists: ${!!supervisorSocket}`);

        if (supervisorSocket) {
          try {
            const notificationData = {
              type: 'counsellor_idle',
              message: `${counsellorName} has been idle for 1 minute`,
              counsellorId,
              counsellorName,
              timestamp: new Date().toISOString(),
            };

            console.log(`📤 Sending idle notification to supervisor ${userData.name}:`, notificationData);

            supervisorSocket.emit('idle_notification', notificationData);
            notifiedCount++;

            console.log(`✅ Successfully sent notification to supervisor: ${userData.name}`);
          } catch (error) {
            console.error(`❌ Error sending notification to supervisor ${userData.name}:`, error);
          }
        } else {
          console.warn(`⚠️ Supervisor socket not found: ${userData.name} (${userData.socketId})`);
          connectedCounsellors.delete(id);
        }
      }
    }

    console.log(`📊 Notification summary: ${notifiedCount}/${supervisorCount} supervisors notified`);

    if (supervisorCount === 0) {
      console.log('ℹ️ No supervisors connected to receive idle notifications');
    }
  }
    function notifySupervisorsOfbreakCounsellor(counsellorId, counsellorName) {

    let supervisorCount = 0;
    let notifiedCount = 0;

    for (const [id, userData] of connectedCounsellors.entries()) {
      if (userData.role === 'Supervisor' || userData.role === 'supervisor') {
        supervisorCount++;
      

        if (supervisorSocket) {
          try {
            const notificationData = {
              type: 'counsellor_idle',
              message: `${counsellorName} has taken break`,
              counsellorId,
              counsellorName,
              timestamp: new Date().toISOString(),
            };


            supervisorSocket.emit('idle_notification', notificationData);
            notifiedCount++;

          } catch (error) {
            console.error(`❌ Error sending notification to supervisor ${userData.name}:`, error);
          }
        } else {
          console.warn(`⚠️ Supervisor socket not found: ${userData.name} (${userData.socketId})`);
          connectedCounsellors.delete(id);
        }
      }
    }

    console.log(`📊 Notification summary: ${notifiedCount}/${supervisorCount} supervisors notified`);

    if (supervisorCount === 0) {
      console.log('ℹ️ No supervisors connected to receive idle notifications');
    }
  }
}

