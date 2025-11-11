document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000';
  const token = localStorage.getItem('token'); // Asumiendo que el admin también se loguea
  const reservationsTableBody = document.getElementById('reservations-table-body');

  // Elementos de filtro
  const filterDateInput = document.getElementById('filter-date');
  const filterUserInput = document.getElementById('filter-user');
  const filterStatusInput = document.getElementById('filter-status');
  const clearFilterButton = document.getElementById('clear-filter-button');

  const paginationContainer = document.getElementById('pagination-container');

  let allReservations = []; // Almacenará todas las reservas para filtrar en el cliente
  let currentPage = 1;
  const reservationsPerPage = 10;

  // Función para obtener todas las reservas
  const fetchReservations = async () => {
    try {
      // Para este ejemplo, asumimos que el admin tiene un token válido.
      // En una app real, el endpoint /admin/reservations debería validar el rol de admin.
      const response = await fetch(`${API_URL}/admin/reservations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const reservations = await response.json();
      allReservations = reservations; // Guardar todas las reservas
      currentPage = 1; // Resetear a la primera página
      displayData(); // Mostrar la tabla inicial y la paginación
    } catch (error) {
      console.error('Error fetching reservations:', error);
      reservationsTableBody.innerHTML = `<tr><td colspan="7">Error al cargar las reservas.</td></tr>`;
    }
  };

  // Función para llenar la tabla con los datos de las reservas
  const populateTable = (reservationsToShow) => {
    reservationsTableBody.innerHTML = ''; // Limpiar la tabla
    if (reservationsToShow.length === 0) {
      reservationsTableBody.innerHTML = '<tr><td colspan="6">No se encontraron reservas con los filtros aplicados.</td></tr>';
      return;
    }

    reservationsToShow.forEach(reservation => {
      // Generar el HTML para los detalles de las habitaciones
      const roomDetailsHtml = reservation.roomSelections && reservation.roomSelections.length > 0
        ? `<ul style="margin: 0; padding-left: 20px;">${reservation.roomSelections.map(sel => `<li>${sel.quantity} x ${sel.type.replace('habitacion_', '').replace(/_/g, ' ')}</li>`).join('')}</ul>`
        : 'No especificado';

      const row = `
        <tr>
          <td>${reservation.userName || 'N/A'}</td>
          <td>${roomDetailsHtml}</td>
          <td>${reservation.reservationDate}</td>
          <td>${reservation.numberOfDays}</td>
          <td>${reservation.status}</td>
          <td>
            <button class="btn" onclick="updateReservationStatus('${reservation.id}', 'confirmado')">Confirmar</button>
            <button class="btn" onclick="updateReservationStatus('${reservation.id}', 'cancelado')">Cancelar</button>
          </td>
        </tr>
      `;
      reservationsTableBody.innerHTML += row;
    });
  };

  // Función que filtra y luego muestra los datos
  const displayData = () => {
    // 1. Filtrar los datos
    const dateFilter = filterDateInput.value;
    const userFilter = filterUserInput.value.toLowerCase();
    const statusFilter = filterStatusInput.value;

    const filteredReservations = allReservations.filter(reservation => {
      const userMatch = reservation.userName.toLowerCase().includes(userFilter);
      const statusMatch = statusFilter ? reservation.status === statusFilter : true;

      // Lógica de filtro de fecha: verifica si la fecha del filtro está dentro del rango de la reserva
      let dateMatch = true;
      if (dateFilter) {
        const filterDate = new Date(dateFilter);
        const reservationStartDate = new Date(reservation.reservationDate);
        const reservationEndDate = new Date(reservationStartDate);
        reservationEndDate.setDate(reservationStartDate.getDate() + parseInt(reservation.numberOfDays, 10));

        dateMatch = filterDate >= reservationStartDate && filterDate < reservationEndDate;
      }

      return userMatch && statusMatch && dateMatch;
    });

    // 2. Paginar los datos filtrados
    const startIndex = (currentPage - 1) * reservationsPerPage;
    const endIndex = startIndex + reservationsPerPage;
    const paginatedReservations = filteredReservations.slice(startIndex, endIndex);

    // 3. Mostrar los datos y los controles de paginación
    populateTable(paginatedReservations);
    setupPagination(filteredReservations.length);
  };

  // Función para configurar los botones de paginación
  const setupPagination = (totalReservations) => {
    paginationContainer.innerHTML = ''; // Limpiar controles existentes
    const pageCount = Math.ceil(totalReservations / reservationsPerPage);

    if (pageCount <= 1) return; // No mostrar paginación si solo hay una página

    // Botón "Anterior"
    const prevButton = document.createElement('button');
    prevButton.textContent = 'Anterior';
    prevButton.className = 'btn';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        displayData();
      }
    });
    paginationContainer.appendChild(prevButton);

    // Indicador de página
    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${currentPage} de ${pageCount}`;
    paginationContainer.appendChild(pageIndicator);

    // Botón "Siguiente"
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Siguiente';
    nextButton.className = 'btn';
    nextButton.disabled = currentPage === pageCount;
    nextButton.addEventListener('click', () => {
      if (currentPage < pageCount) {
        currentPage++;
        displayData();
      }
    });
    paginationContainer.appendChild(nextButton);
  };

  // Función para limpiar los filtros
  const clearFilters = () => {
    filterDateInput.value = '';
    filterUserInput.value = '';
    filterStatusInput.value = '';
    currentPage = 1;
    displayData();
  };

  // Event Listeners para los filtros
  filterDateInput.addEventListener('input', applyFilters);
  filterUserInput.addEventListener('input', applyFilters);
  filterStatusInput.addEventListener('change', applyFilters);
  clearFilterButton.addEventListener('click', clearFilters);

  function applyFilters() {
    currentPage = 1;
    displayData();
  }

  // Función para actualizar el estado de una reserva (simulada por ahora)
  window.updateReservationStatus = async (reservationId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/admin/reservations/${reservationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Error al actualizar el estado.');
      }

      // Si la actualización fue exitosa, recargamos las reservas para ver el cambio
      fetchReservations();
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  // Cargar las reservas al cargar la página
  fetchReservations();
});