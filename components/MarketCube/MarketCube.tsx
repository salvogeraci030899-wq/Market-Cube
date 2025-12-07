// Aggiungi questa funzione prima del componente
const fetchMarketData = async (licenseKey: string | null) => {
  // Se non c'è license key, usa dati demo
  if (!licenseKey || licenseKey === 'demo') {
    return generateDemoData();
  }
  
  try {
    const response = await fetch('/api/market-data', {
      headers: {
        'X-License-Key': licenseKey
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch market data');
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching real data:', error);
    // Fallback a demo
    return generateDemoData();
  }
};