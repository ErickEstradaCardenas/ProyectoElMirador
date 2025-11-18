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

  // Función para decodificar el token JWT (simplificada, solo para leer el payload)
  const parseJwt = (token) => {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
      return null;
    }
  };

  if (token && loginLink && navList) {
    // Usuario autenticado: cambiar "Iniciar Sesión" por "Mi Perfil" y añadir "Cerrar Sesión"
    loginLink.textContent = 'Mi Perfil';
    loginLink.href = 'perfil.html';

    const orderListItem = document.createElement('li');
    const orderLink = document.createElement('a');
    orderLink.href = 'pedidos.html';
    orderLink.textContent = 'Pedir Comida';
    orderListItem.appendChild(orderLink);
    loginLink.parentElement.insertAdjacentElement('beforebegin', orderListItem);

    // --- Lógica para el Panel de Administración ---
    const userPayload = parseJwt(token);
    if (userPayload && userPayload.role === 'admin') {
      const adminListItem = document.createElement('li');
      const adminLink = document.createElement('a');
      adminLink.href = 'admin.html';
      adminLink.textContent = 'Panel de Admin';
      adminListItem.appendChild(adminLink);
      loginLink.parentElement.insertAdjacentElement('beforebegin', adminListItem);
    }

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
          const userPayload = parseJwt(result.token);
          showMessage(loginForm, result.message);
          // Redirigir al panel de admin si el rol es 'admin', si no, al perfil
          const destination = userPayload?.role === 'admin' ? 'admin.html' : 'perfil.html';
          setTimeout(() => {
            window.location.href = destination;
          }, 1000);
        } else {
          showMessage(loginForm, result.message, true);
        }
      } catch (error) {
        showMessage(loginForm, 'Error al conectar con el servidor.', true);
      }
    });
  }

  // --- Reservation Form Logic ---
  const reservationForm = document.getElementById('reservation-form');
  if (reservationForm) {
    // Primero, verificar si el usuario está logueado
    const token = localStorage.getItem('token');
    if (!token) {
      // Si no hay token, redirigir al login después de un mensaje
      showMessage(reservationForm, 'Debes iniciar sesión para poder reservar.', true);
      setTimeout(() => window.location.href = 'login.html', 2000);
    return; // Detener la ejecución si no está logueado
    }

  // --- Lógica de Stripe ---
  let stripe, elements;

    // Lógica para añadir/eliminar selecciones de habitaciones
    const roomSelectionsContainer = document.getElementById('room-selections-container');
    const addRoomButton = document.getElementById('add-room-button');
    const roomSelectionTemplate = document.getElementById('room-selection-template');

    const addRoomSelection = () => {
      const clone = roomSelectionTemplate.content.cloneNode(true);
      const newItem = clone.querySelector('.room-selection-item');
      roomSelectionsContainer.appendChild(newItem);

      // Añadir listener para el botón de eliminar
      newItem.querySelector('.remove-room-button').addEventListener('click', () => {
        newItem.remove();
        updateTotalPrice(); // Actualizar precio al eliminar
      });

      // Actualizar precio cuando se cambia el tipo o la cantidad
      newItem.querySelector('.room-type-select').addEventListener('change', updateTotalPrice);
      newItem.querySelector('.room-quantity-input').addEventListener('input', updateTotalPrice);
    };

    // --- Lógica de Cálculo de Precio Total ---
    const ROOM_PRICES = {
      'habitacion_1_persona': 60,
      'habitacion_2_personas': 100,
      'habitacion_3_personas': 140,
      'habitacion_4_personas': 170,
      'habitacion_5_personas': 200,
    };

    const totalPriceElement = document.getElementById('total-price');
    const numberOfDaysInput = document.getElementById('numberOfDays');

    const updateTotalPrice = () => {
      const numberOfDays = parseInt(numberOfDaysInput.value, 10) || 0;
      let total = 0;

      document.querySelectorAll('.room-selection-item').forEach(item => {
        const type = item.querySelector('.room-type-select').value;
        const quantity = parseInt(item.querySelector('.room-quantity-input').value, 10) || 0;
        const pricePerNight = ROOM_PRICES[type] || 0;
        total += pricePerNight * quantity;
      });

      const finalPrice = total * numberOfDays;
      totalPriceElement.textContent = `S/ ${finalPrice.toFixed(2)}`;
    };

    // Añadir la primera selección de habitación por defecto
    addRoomSelection();
    updateTotalPrice(); // Calcular precio inicial

    // Listener para el botón "Añadir Habitación"
    addRoomButton.addEventListener('click', addRoomSelection);

    // Función para obtener todas las selecciones de habitaciones del formulario
    const getRoomSelections = () => {
      const selections = [];
      document.querySelectorAll('.room-selection-item').forEach(item => {
        const type = item.querySelector('.room-type-select').value;
        const quantity = parseInt(item.querySelector('.room-quantity-input').value, 10);
        if (type && quantity) { // Asegurarse de que haya un tipo y una cantidad válida
          selections.push({ type, quantity });
        }
      });
      return selections;
    };

    // Listener para la cantidad de días
    numberOfDaysInput.addEventListener('input', updateTotalPrice);

    // Inicializar Flatpickr para el calendario
    const initCalendar = async () => {
      try {
        const response = await fetch(`${API_URL}/occupied-dates`);
        const occupiedDates = await response.json();

        flatpickr("#reservationDate", {
          minDate: "today", // No se pueden seleccionar fechas pasadas
          disable: occupiedDates, // Deshabilita las fechas ya reservadas
          dateFormat: "Y-m-d", // Formato de fecha consistente con el backend
        });
      } catch (error) {
        console.error('Error al cargar las fechas ocupadas:', error);
        // Si falla, inicializa el calendario sin fechas deshabilitadas
        flatpickr("#reservationDate", { minDate: "today", dateFormat: "Y-m-d" });
      }
    };
    initCalendar();

    reservationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(reservationForm);
      const submitButton = reservationForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Procesando pago...';

      const reservationData = {
        reservationDate: formData.get('reservationDate'),
        numberOfDays: parseInt(formData.get('numberOfDays'), 10),
        reservationDate: document.getElementById('reservationDate').value,
        numberOfDays: parseInt(document.getElementById('numberOfDays').value, 10),
        roomSelections: getRoomSelections() // Obtener las selecciones dinámicas
      };

      if (reservationData.roomSelections.length === 0) { showMessage(reservationForm, 'Debes seleccionar al menos un tipo de habitación.', true); return; }

      try {
        const response = await fetch(`${API_URL}/reservations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(reservationData),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || 'No se pudo crear la reserva.');
        }

        showMessage(reservationForm, result.message, false);
        submitButton.textContent = 'Reserva Realizada';
        setTimeout(() => window.location.href = 'perfil.html', 2000);

      } catch (error) {
        showMessage(reservationForm, error.message, true);
        submitButton.disabled = false;
        submitButton.textContent = 'Realizar Reserva y Pagar';
      }
    });
  }

  // --- Food Order Page Logic ---
  if (window.location.pathname.endsWith('pedidos.html')) {
    const token = localStorage.getItem('token');
    const foodOrderForm = document.getElementById('food-order-form');

    if (!token) {
      showMessage(foodOrderForm, 'Debes iniciar sesión para poder realizar un pedido.', true);
      setTimeout(() => window.location.href = 'login.html', 2000);
    } else {
      const totalOrderPriceElement = document.getElementById('total-order-price');

      const updateOrderTotal = () => {
        let total = 0;
        document.querySelectorAll('#menu-items-container input[type="number"]').forEach(input => {
          const quantity = parseInt(input.value, 10) || 0;
          const price = parseFloat(input.dataset.price) || 0;
          total += price * quantity;
        });
        totalOrderPriceElement.textContent = `S/ ${total.toFixed(2)}`;
      };

      const addEventListenersToInputs = () => {
        document.querySelectorAll('#menu-items-container input[type="number"]').forEach(input => {
          input.addEventListener('input', updateOrderTotal);
        });
      };

      // Cargar el menú de comida
      const menuContainer = document.getElementById('menu-items-container');
      fetch(`${API_URL}/menu`)
        .then(res => res.json())
        .then(menuItems => {
          menuContainer.innerHTML = ''; // Limpiar el mensaje de "cargando"
          menuItems.forEach(item => {
            const discountedPrice = item.price * 0.85; // 15% de descuento para socios
            const menuItemHtml = `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee;">
                <div>
                  <strong style="display: block;">${item.name}</strong>
                  <div>
                    <span style="text-decoration: line-through; color: var(--muted); font-size: 0.9em;">S/ ${item.price.toFixed(2)}</span>
                    <strong style="color: var(--green); margin-left: 8px;">S/ ${discountedPrice.toFixed(2)}</strong>
                  </div>
                </div>
                <input type="number" min="0" value="0" data-item-id="${item.id}" data-price="${discountedPrice.toFixed(2)}" style="width: 60px; text-align: center;">
              </div>
            `;
            menuContainer.innerHTML += menuItemHtml;
          });
          addEventListenersToInputs(); // Añadir listeners a los nuevos inputs
        })
        .catch(error => {
          console.error('Error al cargar el menú:', error);
          menuContainer.innerHTML = '<p style="color: red;">Error al cargar el menú.</p>';
        });

      // Lógica para enviar el pedido de comida
      foodOrderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const items = [];
        foodOrderForm.querySelectorAll('input[type="number"]').forEach(input => {
          const quantity = parseInt(input.value, 10);
          if (quantity > 0) {
            items.push({ itemId: input.dataset.itemId, quantity: quantity });
          }
        });

        if (items.length === 0) {
          showMessage(foodOrderForm, 'Debes seleccionar la cantidad de al menos un plato.', true);
          return;
        }

        try {
          const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ items }),
          });
          const result = await response.json();
          showMessage(foodOrderForm, result.message, !response.ok);
        } catch (error) {
          showMessage(foodOrderForm, 'Error al conectar con el servidor.', true);
        }
      });
    }
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

        // Ahora que el perfil está cargado, cargamos los historiales.
        fetchReservationsHistory();
        fetchFoodOrdersHistory();
      })
      .catch((error) => {
        console.error('Error al obtener perfil:', error.message);
        // Si el token es inválido o hay un error, limpiar y redirigir
        localStorage.removeItem('token');
        window.location.replace('login.html'); // .replace() es mejor para no guardar la pág. de perfil en el historial
      });

      const fetchReservationsHistory = () => {
        fetch(`${API_URL}/my-reservations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(reservations => {
          const historyBody = document.getElementById('reservations-history-body');
          historyBody.innerHTML = ''; // Limpiar antes de repoblar
          if (reservations.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No tienes reservas aún.</td></tr>';
            return;
          }
          populateReservationsHistory(reservations);
        })
        .catch(handleHistoryError);
      };

      const populateReservationsHistory = (reservations) => {
        const historyBody = document.getElementById('reservations-history-body');
        historyBody.innerHTML = ''; // Limpiar la tabla
        reservations.forEach(res => {
          const roomDetailsHtml = res.roomSelections ? `<ul style="margin: 0; padding-left: 20px;">${res.roomSelections.map(sel => `<li>${sel.quantity} x ${sel.type.replace('habitacion_', '').replace(/_/g, ' ')}</li>`).join('')}</ul>` : 'No especificado';
          
          // --- Lógica para mostrar el botón de cancelar ---
          let cancelButtonHtml = '';
          if (res.status === 'pendiente') {
            const now = new Date();
            const reservationStartDate = new Date(res.reservationDate);
            const cancellationDeadline = new Date(reservationStartDate);
            cancellationDeadline.setDate(reservationStartDate.getDate() - 1);
            cancellationDeadline.setHours(12, 0, 0, 0);
            if (now <= cancellationDeadline) {
              cancelButtonHtml = `<button class="btn" style="background-color: #c0392b; font-size: 0.9em; padding: 4px 8px;" onclick="cancelMyReservation('${res.id}')">Cancelar</button>`;
            }
          }

          const row = `
            <tr>
              <td>${roomDetailsHtml}</td>
              <td>${res.reservationDate}</td>
              <td>${res.numberOfDays}</td>
              <td><span class="status-${res.status}">${res.status.charAt(0).toUpperCase() + res.status.slice(1)}</span></td>
              <td>${cancelButtonHtml}</td>
            </tr>
          `;
          historyBody.innerHTML += row;
        });
      };

      const handleHistoryError = (error) => {
        console.error('Error al cargar el historial de reservas:', error);
        const historyBody = document.getElementById('reservations-history-body');
        historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error al cargar el historial.</td></tr>';
      };

      window.cancelMyReservation = async (reservationId) => {
        if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?')) return;

        try {
          const response = await fetch(`${API_URL}/my-reservations/${reservationId}/cancel`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || 'No se pudo cancelar la reserva.');
          }

          alert('Reserva cancelada con éxito.');
          fetchReservationsHistory(); // Recargar el historial para mostrar el estado actualizado
        } catch (error) {
          alert(`Error: ${error.message}`);
        }
      };

      const fetchFoodOrdersHistory = () => {
        fetch(`${API_URL}/my-food-orders`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(orders => {
          const historyBody = document.getElementById('food-orders-history-body');
          historyBody.innerHTML = ''; // Limpiar antes de repoblar
          if (orders.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No has realizado pedidos de comida aún.</td></tr>';
            return;
          }

          orders.forEach(order => {
            const itemDetailsHtml = `<ul style="margin: 0; padding-left: 20px;">${order.items.map(item => `<li>${item.quantity} x ${item.name}</li>`).join('')}</ul>`;
            const orderDate = new Date(order.orderDate).toLocaleDateString('es-ES');
            const cancelButtonHtml = order.status === 'recibido' ? `<button class="btn" style="background-color: #c0392b; font-size: 0.9em; padding: 4px 8px;" onclick="cancelMyFoodOrder('${order.id}')">Cancelar</button>` : '';

            const row = `
              <tr>
                <td>${orderDate}</td>
                <td>${itemDetailsHtml}</td>
                <td>S/ ${order.total.toFixed(2)}</td>
                <td><span class="status-${order.status}">${order.status.charAt(0).toUpperCase() + order.status.slice(1)}</span></td>
                <td>${cancelButtonHtml}</td>
              </tr>
            `;
            historyBody.innerHTML += row;
          });
        })
        .catch(error => {
          console.error('Error al cargar el historial de pedidos:', error);
          const historyBody = document.getElementById('food-orders-history-body');
          historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: red;">Error al cargar el historial de pedidos.</td></tr>';
        });
      };

      window.cancelMyFoodOrder = async (orderId) => {
        if (!confirm('¿Estás seguro de que deseas cancelar este pedido?')) return;

        try {
          const response = await fetch(`${API_URL}/my-food-orders/${orderId}/cancel`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || 'No se pudo cancelar el pedido.');
          }

          alert('Pedido cancelado con éxito.');
          fetchFoodOrdersHistory(); // Recargar el historial para mostrar el estado actualizado
        } catch (error) {
          alert(`Error: ${error.message}`);
        }
      };
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