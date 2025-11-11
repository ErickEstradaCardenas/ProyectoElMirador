document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'http://localhost:3000';
  const token = localStorage.getItem('token');
  const ordersTableBody = document.getElementById('orders-table-body');

  const filterDateInput = document.getElementById('filter-date');
  const filterUserInput = document.getElementById('filter-user');
  const filterStatusInput = document.getElementById('filter-status');
  const clearFilterButton = document.getElementById('clear-filter-button');
  const paginationContainer = document.getElementById('pagination-container');

  let allOrders = [];
  let currentPage = 1;
  const itemsPerPage = 10;

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/food-orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const orders = await response.json();
      allOrders = orders;
      currentPage = 1;
      displayData();
    } catch (error) {
      console.error('Error fetching orders:', error);
      ordersTableBody.innerHTML = `<tr><td colspan="6">Error al cargar los pedidos.</td></tr>`;
    }
  };

  const populateTable = (ordersToShow) => {
    ordersTableBody.innerHTML = '';
    if (ordersToShow.length === 0) {
      ordersTableBody.innerHTML = '<tr><td colspan="6">No se encontraron pedidos.</td></tr>';
      return;
    }

    ordersToShow.forEach(order => {
      const itemDetailsHtml = `<ul style="margin: 0; padding-left: 20px;">${order.items.map(item => `<li>${item.quantity} x ${item.name}</li>`).join('')}</ul>`;
      const orderDate = new Date(order.orderDate).toLocaleString('es-ES');
      const row = `
        <tr>
          <td>${order.userName || 'N/A'}</td>
          <td>${orderDate}</td>
          <td>${itemDetailsHtml}</td>
          <td>S/ ${order.total.toFixed(2)}</td>
          <td>${order.status.replace('_', ' ')}</td>
          <td>
            <button class="btn" onclick="updateOrderStatus('${order.id}', 'en_preparacion')">En Preparación</button>
            <button class="btn" onclick="updateOrderStatus('${order.id}', 'listo')">Listo</button>
            <button class="btn" onclick="updateOrderStatus('${order.id}', 'entregado')">Entregado</button>
          </td>
        </tr>
      `;
      ordersTableBody.innerHTML += row;
    });
  };

  const displayData = () => {
    const dateFilter = filterDateInput.value;
    const userFilter = filterUserInput.value.toLowerCase();
    const statusFilter = filterStatusInput.value;

    const filteredOrders = allOrders.filter(order => {
      const userMatch = (order.userName || '').toLowerCase().includes(userFilter);
      const statusMatch = statusFilter ? order.status === statusFilter : true;
      const dateMatch = dateFilter ? order.orderDate.startsWith(dateFilter) : true;
      return userMatch && statusMatch && dateMatch;
    });

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedOrders = filteredOrders.slice(startIndex, startIndex + itemsPerPage);

    populateTable(paginatedOrders);
    setupPagination(filteredOrders.length);
  };

  const setupPagination = (totalItems) => {
    paginationContainer.innerHTML = '';
    const pageCount = Math.ceil(totalItems / itemsPerPage);
    if (pageCount <= 1) return;

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Anterior';
    prevButton.className = 'btn';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
      currentPage--;
      displayData();
    });
    paginationContainer.appendChild(prevButton);

    const pageIndicator = document.createElement('span');
    pageIndicator.textContent = `Página ${currentPage} de ${pageCount}`;
    paginationContainer.appendChild(pageIndicator);

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Siguiente';
    nextButton.className = 'btn';
    nextButton.disabled = currentPage === pageCount;
    nextButton.addEventListener('click', () => {
      currentPage++;
      displayData();
    });
    paginationContainer.appendChild(nextButton);
  };

  const clearFilters = () => {
    filterDateInput.value = '';
    filterUserInput.value = '';
    filterStatusInput.value = '';
    currentPage = 1;
    displayData();
  };

  function applyFilters() {
    currentPage = 1;
    displayData();
  }

  filterDateInput.addEventListener('input', applyFilters);
  filterUserInput.addEventListener('input', applyFilters);
  filterStatusInput.addEventListener('change', applyFilters);
  clearFilterButton.addEventListener('click', clearFilters);

  window.updateOrderStatus = async (orderId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/admin/food-orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Error al actualizar estado.');
      }
      fetchOrders(); // Recargar los pedidos para ver el cambio
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  fetchOrders();
});