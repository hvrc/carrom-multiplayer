import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainMenu from './MainMenu';
import Room from './Room';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/:roomName" element={<Room />} />
      </Routes>
    </BrowserRouter>
  );
}