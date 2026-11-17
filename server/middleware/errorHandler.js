const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map((e) => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }

  // Sequelize unique constraint error
  if (err.name === 'SequelizeUniqueConstraintError') {
    const fields = err.errors.map((e) => e.path);
    return res.status(400).json({ message: `${fields.join(', ')} already exists` });
  }

  // Sequelize foreign key constraint error
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ message: 'Referenced resource not found' });
  }

  const status = err.statusCode || 500;
  res.status(status).json({
    message: status >= 500 ? 'Internal server error' : err.message,
  });
};

module.exports = errorHandler;
