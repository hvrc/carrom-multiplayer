import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Menu from './Menu';
import Room from './Room';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/:roomName" element={<Room />} />
      </Routes>
    </BrowserRouter>
  );
}