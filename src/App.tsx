import NotificationListener from './components/NotificationListener';
import Toast, { useToast } from './components/Toast';
import Routes from './router';

function App() {
  const { toast, showToast, hideToast } = useToast();

  return (
    <div className="app-container h-screen w-full">
      {/* Listener Global de Mensagens */}
      <NotificationListener showToast={showToast} />
      
      {/* Roteador Principal */}
      <Routes showToast={showToast} />
    
      {/* Componente de Toast Único */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={hideToast} 
        />
      )}
    </div>
  );
}

export default App;