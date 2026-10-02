"""The recall panel (SPEC 4.5): cards for the names you're typing, and search alongside.

A card: name, type and tags; the summary (or the first mention, past 3 mentions); up
to 3 relationships; the last 3 mentions, dated. Actions: Link (turn the plain name in
the box into a mention) and, for a new name, a type picker that accepts it.
Never a card for the player character (the capture box leaves it out).
"""

from collections.abc import Callable

from PySide6.QtCore import Signal
from PySide6.QtGui import QAction
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QMenu, QVBoxLayout, QWidget

from satchel.core.display import plain_text
from satchel.core.model import Entity, NoteRow
from satchel.core.recall import card_blurb, relation_text
from satchel.core.search import should_search
from satchel.core.when import day_label
from satchel.ui import strings
from satchel.ui.components import ElidedLabel, button, caption, muted
from satchel.ui.palette import SPACE
from satchel.ui.store import CharacterStore


def _wrapped(label: QLabel) -> QLabel:
    label.setWordWrap(True)
    return label


class RecallCard(QFrame):
    link_requested = Signal(str)
    type_chosen = Signal(str, str)  # entity id, type id

    def __init__(self, entity: Entity, store: CharacterStore, can_link: bool, parent=None):
        super().__init__(parent)
        self.entity = entity
        self.setProperty("role", "card")
        index = store.index
        facts = store.recall_facts(entity.id)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(SPACE["m"], SPACE["s"], SPACE["m"], SPACE["s"])
        layout.setSpacing(SPACE["xs"])

        # Name, then type and tags in small print.
        title = QLabel(entity.name)
        title.setProperty("role", "card-title")
        layout.addWidget(_wrapped(title))
        kind = strings.CANDIDATE if entity.is_candidate else ""
        if not kind and entity.type_id in index.types_by_id:
            kind = index.types_by_id[entity.type_id].label
        meta = "  ".join([kind, *(f"#{t.replace(' ', '_')}" for t in entity.tags)]).strip()
        if meta:
            layout.addWidget(caption(meta))

        first = facts.first_mention
        blurb = card_blurb(entity.summary, facts, self._plain(first, index) if first else "")
        if blurb:
            kind_, text = blurb
            shown = text if kind_ == "summary" else strings.FIRST_MENTION.format(text=text)
            layout.addWidget(_wrapped(muted(shown)))

        for rel in facts.relations:
            other = index.by_id.get(rel.other_id)
            if other:
                layout.addWidget(_wrapped(caption(relation_text(rel, entity.name, other.name))))

        for note in facts.last_mentions:
            line = f"{day_label(note.created_at)}  {self._plain(note, index)}"
            layout.addWidget(ElidedLabel(line))

        actions = QHBoxLayout()
        actions.setSpacing(SPACE["s"])
        self.link_button = None
        if can_link:
            self.link_button = button(strings.LINK, "quiet")
            self.link_button.clicked.connect(lambda: self.link_requested.emit(entity.id))
            actions.addWidget(self.link_button)
        self.type_button = None
        if entity.is_candidate:
            self.type_button = button(strings.SET_TYPE, "secondary")
            menu = QMenu(self.type_button)
            for t in sorted(index.types_by_id.values(), key=lambda t: t.sort_order):
                action = QAction(t.label, menu)
                action.triggered.connect(
                    lambda _=False, tid=t.id: self.type_chosen.emit(entity.id, tid)
                )
                menu.addAction(action)
            self.type_button.setMenu(menu)
            actions.addWidget(self.type_button)
        actions.addStretch()
        layout.addLayout(actions)

    @staticmethod
    def _plain(note: NoteRow, index) -> str:
        return plain_text(note.text, index.by_id)


class RecallPanel(QWidget):
    link_requested = Signal(str)
    type_chosen = Signal(str, str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(0, 0, 0, 0)
        self._layout.setSpacing(SPACE["s"])
        self._layout.addStretch(1)  # cards stack from the top
        self.cards: list[RecallCard] = []
        self.search_lines: list[QLabel] = []
        self._widgets: list[QWidget] = []
        self._key: tuple = ()

    def show_for(
        self,
        ids: list[str],
        text: str,
        store: CharacterStore | None,
        can_link: Callable[[str], bool],
    ) -> None:
        """Rebuild for these card ids and the capture text. Skips the rebuild when
        nothing visible would change, so typing doesn't flicker the panel."""
        if store is None:
            self._clear()
            self._key = ()
            return
        entity_ids, notes = store.search(text) if should_search(text) else ([], [])
        found = [i for i in entity_ids if i not in ids]
        key = (
            tuple(ids),
            tuple(can_link(i) for i in ids),
            tuple(found),
            tuple(n.id for n in notes),
            tuple(store.index.by_id[i].type_id for i in ids),  # a quick type redraws
        )
        if key == self._key:
            return
        self._key = key
        self._clear()
        for entity_id in ids:
            card = RecallCard(store.index.by_id[entity_id], store, can_link(entity_id))
            card.link_requested.connect(self.link_requested)
            card.type_chosen.connect(self.type_chosen)
            self._add(card)
            self.cards.append(card)
        if found or notes:
            self._add(caption(strings.SEARCH_HEADING))
            for entity_id in found:
                self._add_search_line(store.index.by_id[entity_id].name)
            for note in notes:
                line = f"{day_label(note.created_at)}  {plain_text(note.text, store.index.by_id)}"
                self._add_search_line(line)

    def _add_search_line(self, text: str) -> None:
        label = ElidedLabel(text)
        self._add(label)
        self.search_lines.append(label)

    def _add(self, widget: QWidget) -> None:
        self._layout.insertWidget(self._layout.count() - 1, widget)
        self._widgets.append(widget)

    def _clear(self) -> None:
        for w in self._widgets:
            self._layout.removeWidget(w)
            w.hide()  # deleteLater waits for the event loop (see feed.py)
            w.deleteLater()
        self._widgets, self.cards, self.search_lines = [], [], []
