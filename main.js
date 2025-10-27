document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000';

  // --- Helper para mostrar mensajes ---
  const showMessage = (form, message, isError = false) => {
    const messageElement = form.querySelector('.form-message');
    if (messageElement) {
      messageElement.textContent = message;
      messageElement.style.color = isError ? 'red' : 'green';
      messageElement.style.display = 'block';
    }
  };

  // --- Lógica del Menú Móvil (Hamburger) ---
  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('nav ul');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      navMenu.classList.toggle('show');
    });
  }

  // --- Lógica de Autenticación y Navegación ---
  const token = localStorage.getItem('token');
  const loginLink = document.querySelector('a[href="login.html"]');
  const navList = document.querySelector('nav ul');

  if (token && loginLink && navList) {
    // Usuario autenticado: cambiar "Iniciar Sesión" por "Mi Perfil" y añadir "Cerrar Sesión"
    loginLink.textContent = 'Mi Perfil';
    loginLink.href = 'perfil.html';

    const logoutListItem = document.createElement('li');
    const logoutLink = document.createElement('a');
    logoutLink.href = '#';
    logoutLink.textContent = 'Cerrar Sesión';
    logoutLink.style.fontWeight = '600';
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      window.location.href = 'index.html';
    });
    logoutListItem.appendChild(logoutLink);
    navList.appendChild(logoutListItem);
  }

  // --- Lógica para el enlace de navegación activo ---
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('nav ul li a');

  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href').split('/').pop() || 'index.html';
    if (linkPath === currentPath) {
      link.classList.add('active');
      // Si el link activo es "Mi Perfil", también marcamos "Iniciar Sesión" si existe
      if (currentPath === 'perfil.html' && loginLink) {
        loginLink.classList.add('active');
      }
    }
  });

  // --- Auth Forms Logic ---
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(registerForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch(`${API_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
          showMessage(registerForm, result.message);
          setTimeout(() => {
            window.location.href = 'login.html'; // Redirige al login si el registro es exitoso
          }, 1500);
        } else {
          showMessage(registerForm, result.message, true);
        }
      } catch (error) {
        showMessage(registerForm, 'Error al conectar con el servidor.', true);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(loginForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
          // Guardar el token en localStorage
          localStorage.setItem('token', result.token);
          showMessage(loginForm, result.message);
          setTimeout(() => window.location.href = 'perfil.html', 1000);
        } else {
          showMessage(loginForm, result.message, true);
        }
      } catch (error) {
        showMessage(loginForm, 'Error al conectar con el servidor.', true);
      }
    });
  }

  // --- Profile Page Logic ---
  if (window.location.pathname.endsWith('perfil.html')) {
    const token = localStorage.getItem('token');
    if (!token) {
      // Si no hay token, redirigir al login
      window.location.href = 'login.html';
    } else {
      // Si hay token, buscar los datos del perfil
      fetch(`${API_URL}/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => {
        if (!res.ok) {
          // Si el token es inválido (401, 403) o hay otro error
          throw new Error('Token inválido o sesión expirada.');
        }
        return res.json();
      })
      .then(user => {
        document.getElementById('profile-name').textContent = user.name;
        document.getElementById('profile-phone').textContent = user.phone;
      })
      .catch((error) => {
        console.error('Error al obtener perfil:', error.message);
        // Si el token es inválido o hay un error, limpiar y redirigir
        localStorage.removeItem('token');
        window.location.replace('login.html'); // .replace() es mejor para no guardar la pág. de perfil en el historial
      });
    }

    // El botón de logout ahora está en el menú de navegación, pero si
    // se mantiene uno específico en la página de perfil, este código lo manejará.
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'index.html';
      });
    }
  }
});