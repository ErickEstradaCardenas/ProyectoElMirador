require('dotenv').config(); // Carga las variables de entorno desde .env
const express = require('express');
const fs = require('fs'); // fs.promises is used for async operations
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Corrected dependency import
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');


const app = express();
const PORT = 3000;
const DB_FILE = './db.json';
const JWT_SECRET = process.env.JWT_SECRET;

// Definir el inventario total de habitaciones
const ROOM_INVENTORY = {
  'habitacion_1_persona': 10,
  'habitacion_2_personas': 15,
  'habitacion_3_personas': 5,
  'habitacion_4_personas': 5,
  'habitacion_5_personas': 5,
};

// Middleware
app.use(cors()); // Permite peticiones desde otros orígenes (nuestro frontend)
app.use(express.json()); // Permite al servidor entender JSON

// Función para leer la base de datos
const readDB = async () => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { users: [], reservations: [], foodOrders: [] };
    }
    const data = await fs.promises.readFile(DB_FILE, 'utf-8');
    // Si el archivo está vacío o solo contiene espacios, retornamos una estructura por defecto.
    if (!data.trim()) {
      return { users: [], reservations: [], foodOrders: [] };
    }
    const parsedData = JSON.parse(data);
    // Asegurarse de que siempre haya un array de usuarios
    return { users: [], reservations: [], foodOrders: [], ...parsedData }; // Asegura que las propiedades principales siempre existan
  } catch (error) {
    console.error('Error reading database:', error);
    // Propagate the error to be handled by the endpoint
    throw new Error('Could not read from database.');
  }
};

// Función para escribir en la base de datos
const writeDB = async (data) => {
  try {
    await fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to database:', error);
    throw new Error('Could not write to database.');
  }
};

// --- Endpoints ---

// Endpoint para registrar un nuevo usuario
app.post('/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;
    const db = await readDB();

    // Verificar si el usuario ya existe
    const userExists = db.users.find(user => user.phone === phone);
    if (userExists) {
      return res.status(400).json({ message: 'El número de celular ya está registrado.' });
    }

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear nuevo usuario con UUID
    const newUser = { id: uuidv4(), name, phone, password: hashedPassword, role: 'socio' }; // Por defecto, todos los nuevos usuarios son socios
    db.users.push(newUser);
    await writeDB(db);

    res.status(201).json({ message: 'Usuario registrado con éxito.' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Error interno del servidor al registrar.' });
  }
});

// Endpoint para iniciar sesión
app.post('/login', async (req, res) => {
  try {
    const { phone, password, role } = req.body; // Recibimos el rol del formulario
    const db = await readDB();

    // Buscar al usuario
    const user = db.users.find(user => user.phone === phone);
    if (!user) {
      return res.status(400).json({ message: 'Credenciales incorrectas.' });
    }

    // Comparar contraseñas
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales incorrectas.' });
    }

    // Security Check: Validar que el rol seleccionado coincida con el rol en la BD
    if (role === 'admin' && user.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permisos de administrador.' });
    }

    // Crear y firmar el token
    const token = jwt.sign({ id: user.id, name: user.name, role: user.role || 'socio' }, JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ message: `Bienvenido, ${user.name}!`, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error interno del servidor al iniciar sesión.' });
  }
});

// Middleware para proteger rutas
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401); // No hay token

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Token no es válido
    req.user = user;
    next();
  });
};

// Endpoint para obtener datos del perfil
app.get('/profile', authMiddleware, async (req, res) => {
  try {
    const db = await readDB();
    const user = db.users.find(u => u.id === req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    // Devolvemos los datos del usuario sin la contraseña
    const { password, ...userProfile } = user;
    res.json(userProfile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Endpoint para obtener las reservas del usuario logueado
app.get('/my-reservations', authMiddleware, async (req, res) => {
  try {
    const db = await readDB();
    const userReservations = db.reservations.filter(
      reservation => reservation.userId === req.user.id
    );

    // Ordenar por fecha más reciente primero
    userReservations.sort((a, b) => new Date(b.reservationDate) - new Date(a.reservationDate));

    res.json(userReservations);
  } catch (error) {
    console.error('Error fetching user reservations:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Endpoint para crear una nueva reserva (protegido)
app.post('/reservations', authMiddleware, async (req, res) => {
  try {
    const { reservationDate, numberOfDays, roomSelections } = req.body;
    if (!reservationDate || !numberOfDays || !roomSelections || !Array.isArray(roomSelections) || roomSelections.length === 0) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    // Validar que la cantidad de días sea un número entre 1 y 7
    const days = parseInt(numberOfDays, 10);
    if (isNaN(days) || days < 1 || days > 7) {
      return res.status(400).json({ message: 'La cantidad de días debe ser entre 1 y 7.' });
    }

    // --- Lógica de Disponibilidad ---
    const db = await readDB();
    const requestedStartDate = new Date(reservationDate);
    requestedStartDate.setMinutes(requestedStartDate.getMinutes() + requestedStartDate.getTimezoneOffset());

    for (const selection of roomSelections) {
      const { type, quantity } = selection;

      const roomsToBook = parseInt(quantity, 10);
      if (isNaN(roomsToBook) || roomsToBook < 1 || roomsToBook > 5) {
        return res.status(400).json({ message: `Cantidad de habitaciones no válida para ${type}. Debe ser entre 1 y 5.` });
      }
      if (!ROOM_INVENTORY[type]) {
        return res.status(400).json({ message: `Tipo de habitación no válido: ${type}.` });
      }

      for (let i = 0; i < days; i++) {
        const currentDate = new Date(requestedStartDate);
        currentDate.setDate(requestedStartDate.getDate() + i);
        const currentDateStr = currentDate.toISOString().split('T')[0];

        // Contar habitaciones ya reservadas para este tipo en esta fecha
        const bookedRoomsOnDate = db.reservations.reduce((acc, res) => {
          const resStartDate = new Date(res.reservationDate);
          resStartDate.setMinutes(resStartDate.getMinutes() + resStartDate.getTimezoneOffset());
          const resEndDate = new Date(resStartDate);
          resEndDate.setDate(resStartDate.getDate() + parseInt(res.numberOfDays, 10));

          if (currentDate >= resStartDate && currentDate < resEndDate) {
            // Sumar las cantidades de habitaciones de este tipo en reservas existentes
            return acc + (res.roomSelections?.find(rs => rs.type === type)?.quantity || 0);
          }
          return acc;
        }, 0);

        const availableRooms = ROOM_INVENTORY[type];
        if ((bookedRoomsOnDate + roomsToBook) > availableRooms) {
          return res.status(400).json({
            message: `Disponibilidad excedida para el ${type} el ${currentDateStr}. Solo quedan ${availableRooms - bookedRoomsOnDate} habitaciones de ese tipo.`
          });
        }
      }
    }

    const newReservation = {
      id: uuidv4(),
      userId: req.user.id, // ID del usuario que viene del token
      reservationDate,
      numberOfDays: days,
      roomSelections, // Ahora es un array de objetos
      status: 'pendiente'
    };
    db.reservations.push(newReservation);
    await writeDB(db);

    res.status(201).json({ message: 'Reserva realizada con éxito. Nos pondremos en contacto para confirmar.' });
  } catch (error) {
    console.error('Reservation error:', error);
    res.status(500).json({ message: 'Error interno del servidor al crear la reserva.' });
  }
});

// Endpoint for a user to cancel their own reservation
app.patch('/my-reservations/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const db = await readDB();
    const reservationIndex = db.reservations.findIndex(r => r.id === id);

    if (reservationIndex === -1) {
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    const reservation = db.reservations[reservationIndex];

    // Security check: ensure the user owns this reservation
    if (reservation.userId !== userId) {
      return res.status(403).json({ message: 'No tienes permiso para cancelar esta reserva.' });
    }

    // Business logic check: only pending reservations can be cancelled by the user
    if (reservation.status !== 'pendiente') {
      return res.status(400).json({ message: `No se puede cancelar una reserva con estado '${reservation.status}'.` });
    }

    db.reservations[reservationIndex].status = 'cancelado';
    await writeDB(db);

    res.json({ message: 'Reserva cancelada con éxito.' });
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Endpoint para obtener las fechas de habitación ocupadas
app.get('/occupied-dates', async (req, res) => {
  try {
    const db = await readDB();
    const bookingsByDate = {}; // { 'YYYY-MM-DD': { 'habitacion_1_persona': 5, ... } }

    for (const reservation of db.reservations) { // Iterar sobre cada reserva
      const startDate = new Date(reservation.reservationDate);
      startDate.setMinutes(startDate.getMinutes() + startDate.getTimezoneOffset());

      for (const roomSelection of reservation.roomSelections) { // Iterar sobre cada tipo de habitación en la reserva
        const { type, quantity } = roomSelection;
        const roomsBooked = parseInt(quantity, 10) || 1;

        for (let i = 0; i < parseInt(reservation.numberOfDays, 10); i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i);
          const dateStr = currentDate.toISOString().split('T')[0];

          if (!bookingsByDate[dateStr]) bookingsByDate[dateStr] = {};
          if (!bookingsByDate[dateStr][type]) bookingsByDate[dateStr][type] = roomsBooked;
          else bookingsByDate[dateStr][type] += roomsBooked;
        }
      }
    }

    const occupiedDates = [];
    for (const date in bookingsByDate) {
      let allRoomTypesFull = true;
      for (const roomType in ROOM_INVENTORY) {
        const bookedCount = bookingsByDate[date][roomType] || 0;
        if (bookedCount < ROOM_INVENTORY[roomType]) {
          allRoomTypesFull = false; // Se encontró al menos un tipo de habitación con disponibilidad
          break;
        }
      }
      if (allRoomTypesFull) occupiedDates.push(date);
    }
    res.json(Array.from(occupiedDates));

  } catch (error) {
    console.error('Error fetching occupied dates:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Endpoint para obtener todas las reservas (solo para administradores)
app.get('/admin/reservations', authMiddleware, async (req, res) => {
  try {
    // Verificar si el usuario es administrador (puedes usar un campo 'role' en el token)
    if (!req.user.role || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permisos para acceder a esta información.' });
    }

    const db = await readDB();
    const userMap = new Map(db.users.map(user => [user.id, user.name]));

    const reservationsWithUserNames = db.reservations.map(reservation => {
      return {
        ...reservation,
        userName: userMap.get(reservation.userId) || 'Usuario no encontrado'
      };
    });

    res.json(reservationsWithUserNames);
  } catch (error) {
    console.error('Error fetching all reservations:', error);
    res.status(500).json({ message: 'Error interno del servidor al obtener las reservas.' });
  }
});

// Endpoint para actualizar el estado de una reserva (solo para administradores)
app.patch('/admin/reservations/:id', authMiddleware, async (req, res) => {
  try {
    // Validar que el usuario sea administrador
    if (!req.user.role || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'No tienes permisos para realizar esta acción.' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['confirmado', 'cancelado', 'pendiente'].includes(status)) {
      return res.status(400).json({ message: 'Estado no válido.' });
    }

    const db = await readDB();
    const reservationIndex = db.reservations.findIndex(r => r.id === id);

    if (reservationIndex === -1) {
      return res.status(404).json({ message: 'Reserva no encontrada.' });
    }

    db.reservations[reservationIndex].status = status;
    await writeDB(db);

    res.json({ message: 'Estado de la reserva actualizado con éxito.' });
  } catch (error) {
    console.error('Error updating reservation status:', error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar la reserva.' });
  }
});

// Endpoint para obtener el menú del restaurante
app.get('/menu', async (req, res) => {
  // En una aplicación real, esto podría venir de la base de datos.
  // Por ahora, lo definimos aquí.
  const menu = [
    { id: 'ceviche', name: 'Ceviche Clásico', price: 35.00 },
    { id: 'lomo_saltado', name: 'Lomo Saltado', price: 45.00 },
    { id: 'aji_gallina', name: 'Ají de Gallina', price: 38.00 },
    { id: 'causa', name: 'Causa Limeña', price: 25.00 },
    { id: 'picarones', name: 'Picarones', price: 18.00 },
    { id: 'rocoto_relleno', name: 'Rocoto Relleno', price: 42.00 },
    { id: 'pachamanca', name: 'Pachamanca a la Olla', price: 55.00 },
    { id: 'patasca', name: 'Patasca', price: 30.00 },
    { id: 'cuy_chactado', name: 'Cuy Chactado', price: 60.00 },
    { id: 'caldo_gallina', name: 'Caldo de Gallina', price: 28.00 },
    { id: 'chairo', name: 'Chairo', price: 32.00 }
  ];
  res.json(menu);
});

// Endpoint para crear un nuevo pedido de comida
app.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'El pedido no puede estar vacío.' });
    }

    const db = await readDB();
    const newOrder = {
      id: uuidv4(),
      userId: req.user.id,
      orderDate: new Date().toISOString(),
      status: 'recibido',
      items: items, // Array de { itemId, quantity }
    };

    if (!db.foodOrders) {
      db.foodOrders = [];
    }
    db.foodOrders.push(newOrder);
    await writeDB(db);

    res.status(201).json({ message: 'Pedido realizado con éxito.' });
  } catch (error) {
    console.error('Food order error:', error);
    res.status(500).json({ message: 'Error interno del servidor al procesar el pedido.' });
  }
});

// Endpoint para obtener el historial de pedidos de comida del usuario
app.get('/my-food-orders', authMiddleware, async (req, res) => {
  try {
    const db = await readDB();
    const menu = [
      { id: 'ceviche', name: 'Ceviche Clásico', price: 35.00 },
      { id: 'lomo_saltado', name: 'Lomo Saltado', price: 45.00 },
      { id: 'aji_gallina', name: 'Ají de Gallina', price: 38.00 },
      { id: 'causa', name: 'Causa Limeña', price: 25.00 },
      { id: 'picarones', name: 'Picarones', price: 18.00 },
      { id: 'rocoto_relleno', name: 'Rocoto Relleno', price: 42.00 },
      { id: 'pachamanca', name: 'Pachamanca a la Olla', price: 55.00 },
      { id: 'patasca', name: 'Patasca', price: 30.00 },
      { id: 'cuy_chactado', name: 'Cuy Chactado', price: 60.00 },
      { id: 'caldo_gallina', name: 'Caldo de Gallina', price: 28.00 },
      { id: 'chairo', name: 'Chairo', price: 32.00 }
    ];
    const menuMap = new Map(menu.map(item => [item.id, item]));

    const userOrders = (db.foodOrders || []) // Asegurarse de que foodOrders es un array
      .filter(order => order.userId === req.user.id)
      .map(order => {
        let total = 0;
        const itemsWithDetails = order.items.map(item => {
          const menuItem = menuMap.get(item.itemId);
          if (menuItem) {
            total += menuItem.price * item.quantity;
          }
          return { ...item, name: menuItem ? menuItem.name : 'Plato no encontrado' };
        });
        return { ...order, items: itemsWithDetails, total };
      })
      .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

    res.json(userOrders);
  } catch (error) {
    console.error('Error fetching food order history:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.patch('/my-food-orders/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const db = await readDB();
    const orderIndex = (db.foodOrders || []).findIndex(o => o.id === id);

    if (orderIndex === -1) {
      return res.status(404).json({ message: 'Pedido no encontrado.' });
    }

    const order = db.foodOrders[orderIndex];

    // Security check: ensure the user owns this order
    if (order.userId !== userId) {
      return res.status(403).json({ message: 'No tienes permiso para cancelar este pedido.' });
    }

    // Business logic check: only "recibido" orders can be cancelled by the user
    if (order.status !== 'recibido') {
      return res.status(400).json({ message: `No se puede cancelar un pedido con estado '${order.status}'.` });
    }

    db.foodOrders[orderIndex].status = 'cancelado';
    await writeDB(db);

    res.json({ message: 'Pedido cancelado con éxito.' });
  } catch (error) {
    console.error('Error cancelling food order:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/admin/food-orders', authMiddleware, async (req, res) => {
  try {
    if (!req.user.role || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado.' });
    }

    const db = await readDB();
    const menu = [
      { id: 'ceviche', name: 'Ceviche Clásico', price: 35.00 },
      { id: 'lomo_saltado', name: 'Lomo Saltado', price: 45.00 },
      { id: 'aji_gallina', name: 'Ají de Gallina', price: 38.00 },
      { id: 'causa', name: 'Causa Limeña', price: 25.00 },
      { id: 'picarones', name: 'Picarones', price: 18.00 },
      { id: 'rocoto_relleno', name: 'Rocoto Relleno', price: 42.00 },
      { id: 'pachamanca', name: 'Pachamanca a la Olla', price: 55.00 },
      { id: 'patasca', name: 'Patasca', price: 30.00 },
      { id: 'cuy_chactado', name: 'Cuy Chactado', price: 60.00 },
      { id: 'caldo_gallina', name: 'Caldo de Gallina', price: 28.00 },
      { id: 'chairo', name: 'Chairo', price: 32.00 }
    ];
    const menuMap = new Map(menu.map(item => [item.id, item]));
    const userMap = new Map(db.users.map(user => [user.id, user.name]));

    const allOrders = (db.foodOrders || []).map(order => {
      let total = 0;
      const itemsWithDetails = order.items.map(item => {
        const menuItem = menuMap.get(item.itemId);
        if (menuItem) {
          total += menuItem.price * item.quantity;
        }
        return { ...item, name: menuItem ? menuItem.name : 'Plato no encontrado' };
      });
      return { ...order, items: itemsWithDetails, total, userName: userMap.get(order.userId) || 'Usuario Desconocido' };
    }).sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

    res.json(allOrders);
  } catch (error) {
    console.error('Error fetching all food orders:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.patch('/admin/food-orders/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.user.role || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado.' });
    }
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Estado no válido.' });
    }
    const db = await readDB();
    const orderIndex = (db.foodOrders || []).findIndex(o => o.id === id);
    if (orderIndex === -1) return res.status(404).json({ message: 'Pedido no encontrado.' });
    db.foodOrders[orderIndex].status = status;
    await writeDB(db);
    res.json({ message: 'Estado del pedido actualizado.' });
  } catch (error) {
    console.error('Error updating food order status:', error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});