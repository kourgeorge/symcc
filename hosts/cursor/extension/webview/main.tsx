import { createRoot } from 'react-dom/client'
import { App } from './App'
import { surface } from './bridge'
import { Sidebar } from './sidebar'
import './styles.css'

createRoot(document.getElementById('root')!).render(surface === 'side' ? <Sidebar /> : <App />)
