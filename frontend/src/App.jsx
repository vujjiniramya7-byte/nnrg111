import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Footer from "./components/Footer";
import ChatWidget from "./components/ChatWidget";

function App() {
  const [page, setPage] = useState(window.location.pathname);

  useEffect(() => {
    const handler = () => setPage(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (page === "/admin") {
    return <Admin />;
  }

  return (
    <>
      <Navbar />
      <Home />
      <ChatWidget />
      <Footer />
    </>
  );
}

export default App;
