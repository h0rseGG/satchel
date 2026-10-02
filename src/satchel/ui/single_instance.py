"""Only one Satchel at a time.

Two copies would fight over the global hotkey and could both write the same file.
The first copy listens on a named local socket (a named pipe on Windows). A second
copy finds it, asks it to show its window, and exits.
"""

import getpass

from PySide6.QtCore import QObject, Signal
from PySide6.QtNetwork import QLocalServer, QLocalSocket

SHOW = b"show"


def default_server_name() -> str:
    # Per Windows user, so two people on one machine each get their own Satchel.
    return f"satchel-{getpass.getuser()}"


class SingleInstance(QObject):
    """Create one at startup. If `is_primary` is False, another Satchel has been asked
    to show itself and this one should quit. The primary emits `show_requested`."""

    show_requested = Signal()

    def __init__(self, name: str | None = None, parent: QObject | None = None):
        super().__init__(parent)
        self.name = name or default_server_name()
        self.is_primary = not self._ask_running_copy_to_show()
        self._server: QLocalServer | None = None
        if self.is_primary:
            self._listen()

    def _ask_running_copy_to_show(self) -> bool:
        sock = QLocalSocket()
        sock.connectToServer(self.name)
        if not sock.waitForConnected(500):
            return False
        sock.write(SHOW)
        # disconnectFromServer only *starts* closing: the write finishes in the
        # background. Wait for it, or the socket is deleted when this method returns
        # and the message is lost (seen on Windows: state stays ClosingState).
        sock.disconnectFromServer()
        if sock.state() != QLocalSocket.LocalSocketState.UnconnectedState:
            sock.waitForDisconnected(1000)
        return True

    def _listen(self) -> None:
        self._server = QLocalServer(self)
        # If a crashed copy left the name registered, listen() fails; clear and retry.
        if not self._server.listen(self.name):
            QLocalServer.removeServer(self.name)
            self._server.listen(self.name)
        self._server.newConnection.connect(self._on_connection)

    def _on_connection(self) -> None:
        while self._server and self._server.hasPendingConnections():
            sock = self._server.nextPendingConnection()
            sock.readyRead.connect(lambda s=sock: self._on_message(s))
            sock.disconnected.connect(sock.deleteLater)
            # The message may already be waiting before readyRead was connected.
            if sock.bytesAvailable():
                self._on_message(sock)

    def _on_message(self, sock: QLocalSocket) -> None:
        if bytes(sock.readAll().data()).strip() == SHOW:
            self.show_requested.emit()

    def close(self) -> None:
        """Stop listening and free the server (and its sockets) while Qt is still
        running; left to Python's shutdown, they can be destroyed after Qt and crash."""
        if self._server:
            self._server.close()
            self._server.deleteLater()
            self._server = None
