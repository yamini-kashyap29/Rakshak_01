import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { AppDataProvider } from './context/AppData'
import CommandCenter from './pages/CommandCenter'
import Zones from './pages/Zones'
import Resources from './pages/Resources'
import Allocations from './pages/Allocations'
import WhatIf from './pages/WhatIf'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Shelters from './pages/Shelters'
import Hospitals from './pages/Hospitals'

function Shell() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CommandCenter />} />
        <Route path="zones" element={<Zones />} />
        <Route path="resources" element={<Resources />} />
        <Route path="allocations" element={<Allocations />} />
        <Route path="shelters" element={<Shelters />} />
        <Route path="hospitals" element={<Hospitals />} />
        <Route path="whatif" element={<WhatIf />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  )
}
