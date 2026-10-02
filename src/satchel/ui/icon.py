"""The app and tray icon, drawn in code (SPEC 5.3: few icons, line style in ink): a
satchel, a rounded bag with a flap and a buckle, ink lines on paper."""

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QIcon, QPainter, QPainterPath, QPen, QPixmap

from satchel.ui.palette import COLOURS


def _draw(size: int) -> QPixmap:
    pm = QPixmap(size, size)
    pm.fill(Qt.GlobalColor.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    s = size / 32  # drawn on a 32 px grid
    p.setBrush(QColor(COLOURS["paper"]))
    p.setPen(QPen(QColor(COLOURS["ink"]), max(1.5, 2 * s)))
    p.drawRoundedRect(QRectF(4 * s, 9 * s, 24 * s, 19 * s), 4 * s, 4 * s)  # bag
    flap = QPainterPath()
    flap.moveTo(4 * s, 13 * s)
    flap.lineTo(28 * s, 13 * s)
    flap.lineTo(28 * s, 17 * s)
    flap.quadTo(16 * s, 23 * s, 4 * s, 17 * s)
    flap.closeSubpath()
    p.drawPath(flap)
    p.setBrush(QColor(COLOURS["red"]))  # the buckle: the one red mark
    p.drawRect(QRectF(14 * s, 18 * s, 4 * s, 3 * s))
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawArc(QRectF(10 * s, 3 * s, 12 * s, 12 * s), 0, 180 * 16)  # handle
    p.end()
    return pm


def app_icon() -> QIcon:
    icon = QIcon()
    for size in (16, 20, 24, 32, 48, 64, 256):
        icon.addPixmap(_draw(size))
    return icon
