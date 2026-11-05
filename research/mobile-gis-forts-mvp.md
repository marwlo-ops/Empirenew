# Mobile GIS fortów i baronów — wymagania MVP

## Decyzja nadrzędna
Cały moduł projektujemy **mobile-first i do obsługi wyłącznie telefonem**. Nie zakładamy dostępu do komputera ani konieczności używania desktopowego QGIS. Widok desktopowy jest opcjonalny i nie może ograniczać funkcji mobilnych.

## Cel
Lekki, darmowy odpowiednik prywatnej mapy GIS do zaznaczania i analizowania fortów/baronów w Goodgame Empire / E4K PL1, zintegrowany z Empirenew jako osobny moduł. Nie ingeruje w istniejące zakładki Mapa, Szpiegowanie ani Dodatkowe.

## Ograniczenie źródła danych
Aktualnie dostępne API nie dostarcza wiarygodnych danych o fortach/baronach PL1. Nie wolno udawać, że dane pochodzą z API, ani wpisywać współrzędnych na podstawie niepotwierdzonych identyfikatorów typów.
MVP musi działać również bez API:
- użytkownik może dodać punkt ręcznie na mapie;
- nie zakładamy importowania setek/tysięcy zrzutów ekranu ani ręcznego składania mapy z obrazów;
- główny kierunek badawczy to odczyt danych mapy z ruchu sieciowego gry przechwyconego na tym samym telefonie (np. eksport PCAP/PCAPNG z narzędzia diagnostycznego), o ile komunikaty są dostępne do odczytu;
- parser ma działać lokalnie na telefonie lub w aplikacji webowej Empirenew i wyciągać wyłącznie rekordy mapy, bez danych logowania, haseł, tokenów sesji i innych sekretów;
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
1. Import przechwyconego pliku PCAP/PCAPNG z telefonu albo danych JSON wyeksportowanych przez narzędzie diagnostyczne.
2. Parser filtruje wyłącznie komunikaty gry zawierające dane mapy; nie zapisuje danych uwierzytelniających ani tokenów.
3. Rozpoznanie formatu rekordów mapy i identyfikatorów typów obiektów na podstawie potwierdzonych obserwacji, nie zgadywania.
4. Deduplicacja i łączenie kolejnych porcji mapy z różnych komunikatów/przejść po krainie.
5. Dodanie punktu ręcznie, jeśli parser nie rozpozna obiektu.
6. Filtry po krainie, typie, statusie i gotowości do ponownego ataku.
7. Lista punktów z wyszukiwaniem i sortowaniem.
8. Oznaczenie pokonania z zapisem czasu; przypomnienie wizualne, gdy minie 24 h.
9. Eksport kopii JSON/CSV i import kopii na tym samym lub innym telefonie.
10. Brak nadpisywania danych użytkownika przez pustą lub niekompletną synchronizację.

## Prywatność i trwałość
Pierwsza wersja przechowuje dane lokalnie w przeglądarce telefonu (IndexedDB/localStorage zależnie od implementacji), z eksportem kopii zapasowej. Synchronizacja w chmurze jest osobnym, późniejszym etapem i nie jest wymagana do działania MVP.

## Kryteria odbioru
- Wszystkie podstawowe zadania można wykonać na telefonie bez komputera.
- Brak poziomego przewijania przy typowej szerokości telefonu.
- Dodanie, edycja, oznaczenie pokonania, filtrowanie i eksport działają na ekranie dotykowym.
- Aplikacja jasno oznacza dane ręczne/importowane i nie przedstawia ich jako danych API.
- Istniejące moduły Empirenew pozostają nietknięte.


## Bezpieczeństwo przechwyconych danych
Pliki PCAP mogą zawierać dane wrażliwe. Parser powinien przetwarzać plik lokalnie, odrzucać pola uwierzytelniające i nie wysyłać surowego przechwycenia do repozytorium, logów ani publicznego serwera. Przed analizą należy sprawdzić, czy ruch zawiera czytelne komunikaty mapy. Jeśli dane są szyfrowane lub niekompletne, nie obiecujemy ekstrakcji całej mapy i nie próbujemy obchodzić zabezpieczeń.
