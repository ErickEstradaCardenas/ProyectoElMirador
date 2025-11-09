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

// Middleware
app.use(cors()); // Permite peticiones desde otros orígenes (nuestro frontend)
app.use(express.json()); // Permite al servidor entender JSON

// Función para leer la base de datos
const readDB = async () => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { users: [], reservations: [] };
    }
    const data = await fs.promises.readFile(DB_FILE, 'utf-8');
    // Si el archivo está vacío o solo contiene espacios, retornamos una estructura por defecto.
    if (!data.trim()) {
      return { users: [], reservations: [] };
    }
    const parsedData = JSON.parse(data);
    // Asegurarse de que siempre haya un array de usuarios
    return { users: [], reservations: [], ...parsedData }; // Asegura que `users` y `reservations` siempre existan
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
    const newUser = { id: uuidv4(), name, phone, password: hashedPassword };
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
    const { phone, password } = req.body;
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

    // Crear y firmar el token
    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '1h' });

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

// Endpoint para crear una nueva reserva (protegido)
app.post('/reservations', authMiddleware, async (req, res) => {
  try {
    const { service, reservationDate } = req.body;
    if (!service || !reservationDate) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    const db = await readDB();
    const newReservation = {
      id: uuidv4(),
      userId: req.user.id, // ID del usuario que viene del token
      service,
      reservationDate,
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

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});