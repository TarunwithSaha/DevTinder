const connectionService = require("../services/connectionService");

exports.received = async (req, res) => {
  const requests = await connectionService.listReceived(req.user);
  res.json({ count: requests.length, requests });
};

exports.connections = async (req, res) => {
  const connections = await connectionService.listConnections(req.user);
  res.json({ count: connections.length, connections });
};