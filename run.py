import socket, threading, time, webbrowser
import uvicorn
from backend import config
from backend.main import app

def free_port(p):
    for q in range(p, p + 20):
        with socket.socket() as s:
            if s.connect_ex((config.HOST, q)) != 0:
                return q
    return p

if __name__ == "__main__":
    port = free_port(config.PORT)
    threading.Thread(target=lambda: (time.sleep(1.5), webbrowser.open(f"http://{config.HOST}:{port}")), daemon=True).start()
    print(f"\n  {config.APP_NAME}\n  http://{config.HOST}:{port}  (Ctrl+C pour quitter)\n")
    uvicorn.run(app, host=config.HOST, port=port, log_level="warning")
