const connectionService = require("../services/connectionService");
const feedService = require("../services/feedService");
const { parsePagination } = require("../utils/pagination");

exports.received = async (req, res) => {
  const { requests, nextCursor } = await connectionService.listReceived(
    req.user,
    parsePagination(req.query)
  );
  res.json({ count: requests.length, requests, nextCursor });
};

exports.connections = async (req, res) => {
  const { connections, nextCursor } = await connectionService.listConnections(
    req.user,
    parsePagination(req.query)
  );
  res.json({ count: connections.length, connections, nextCursor });
};

exports.feed = async (req, res) => {
  const { users, nextCursor } = await feedService.getFeed(req.user, parsePagination(req.query));
  res.json({ count: users.length, users, nextCursor });
};