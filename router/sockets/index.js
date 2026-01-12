import handleCounsellorSockets from './counsellor.js';
import manageWebsiteChat from './websiteChat.socket.js';

const connectedCounsellors = new Map();



export default function initSocket(io) {
  global.io = io;
  global.connectedCounsellors = connectedCounsellors;
  global.sendLeadNotification = sendLeadNotification;

  manageWebsiteChat(io);

  io.on('connection', (socket) => {
    handleCounsellorSockets(socket, connectedCounsellors);

    socket.on('disconnect', () => {
      for (const [counsellorId, data] of connectedCounsellors.entries()) {
        if (data.socketId === socket.id) {
          connectedCounsellors.delete(counsellorId);
          break;
        }
      }
    });
  });
}