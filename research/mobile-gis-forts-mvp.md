# Mobile GIS fortów i baronów — wymagania MVP

## Decyzja nadrzędna
Cały moduł projektujemy **mobile-first i do obsługi wyłącznie telefonem**. Nie zakładamy dostępu do komputera ani konieczności używania desktopowego QGIS. Widok desktopowy jest opcjonalny i nie może ograniczać funkcji mobilnych.

## Cel
Lekki, darmowy odpowiednik prywatnej mapy GIS do zaznaczania i analizowania fortów/baronów w Goodgame Empire / E4K PL1, zintegrowany z Empirenew jako osobny moduł. Nie ingeruje w istniejące zakładki Mapa, Szpiegowanie ani Dodatkowe.

## Ograniczenie źródła danych
Aktualnie dostępne API nie dostarcza wiarygodnych danych o fortach/baronach PL1. Nie wolno udawać, że dane pochodzą z API, ani wpisywać współrzędnych na podstawie niepotwierdzonych identyfikatorów typów.
MVP musi działać również bez API:
- użytkownik może dodać punkt ręcznie na mapie;
- użytkownik może zaimportować własny obraz/screenshot mapy z telefonu;
- użytkownik kalibruje obraz na podstawie znanych współrzędnych, a następnie zaznacza obiekty dotknięciem;
- import/eksport JSON/CSV umożliwia przenoszenie kopii danych;
- źródło i pewność każdego punktu są zapisywane (ręczny, import, potwierdzony odczyt).
Jeśli później pojawi się legalne i wiarygodne źródło danych, można dodać adapter bez przebudowy interfejsu.

## Projekt mobilny
- Responsywny układ dla ekranów telefonów od ok. 360 px szerokości.
- Duże przyciski i pola dotykowe (minimum ok. 44 px), brak funkcji wymagających hover.
- Nawigacja dolna: Mapa, Dodaj, Lista, Historia/Ustawienia.
- Mapa zajmuje większość ekranu; panel szczegółów otwiera się jako dolny arkusz.
- Obsługa gestów dotykowych: przesuwanie i powiększanie mapy; kontrolki zoom jako alternatywa.
- Formularze krótkie, z klawiaturą numeryczną dla X/Y.
- PWA: możliwość dodania do ekranu głównego; lokalny cache ostatnich danych i czytelny stan offline.
- Nie wymaga płatnej licencji ani zewnętrznego konta GIS.

## Dane punktu
- identyfikator lokalny;
- kraina (Piaski, Lód, Ogień; kolejne krainy dopiero po potwierdzeniu);
- typ (fort, baron, inny — jawnie wybierany);
- X/Y;
- poziom/nazwa/opis — opcjonalne;
- status: aktywny / pokonany;
- czas pokonania i wyliczony termin ponownej dostępności (domyślnie 24 h, edytowalny);
- źródło danych i poziom pewności;
- notatka i data ostatniej aktualizacji.

## Funkcje MVP
1. Dodanie punktu ręcznie przez dotknięcie mapy lub formularz współrzędnych.
2. Własny obraz mapy z telefonu jako podkład; kalibracja współrzędnych przed użyciem.
3. Filtry po krainie, typie, statusie i gotowości do ponownego ataku.
4. Lista punktów z wyszukiwaniem i sortowaniem.
5. Oznaczenie pokonania z zapisem czasu; przypomnienie wizualne, gdy minie 24 h.
6. Eksport kopii JSON/CSV i import kopii na tym samym lub innym telefonie.
7. Brak nadpisywania danych użytkownika przez pustą lub niekompletną synchronizację.

## Prywatność i trwałość
Pierwsza wersja przechowuje dane lokalnie w przeglądarce telefonu (IndexedDB/localStorage zależnie od implementacji), z eksportem kopii zapasowej. Synchronizacja w chmurze jest osobnym, późniejszym etapem i nie jest wymagana do działania MVP.

## Kryteria odbioru
- Wszystkie podstawowe zadania można wykonać na telefonie bez komputera.
- Brak poziomego przewijania przy typowej szerokości telefonu.
- Dodanie, edycja, oznaczenie pokonania, filtrowanie i eksport działają na ekranie dotykowym.
- Aplikacja jasno oznacza dane ręczne/importowane i nie przedstawia ich jako danych API.
- Istniejące moduły Empirenew pozostają nietknięte.
