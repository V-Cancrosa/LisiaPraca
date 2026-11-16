# Lisia Praca

Aplikacja na telefon (PWA) dla kierowcy jeżdżącego dla Ubera we flocie.

**Aplikacja: https://v-cancrosa.github.io/LisiaPraca/**

## Co robi

- **Zmiana:** „Włączam aplikację” / „Wyłączam aplikację” zapisuje czas w aplikacji Ubera.
- **Kurs w etapach**, tak jak w aplikacji Ubera:
  1. **Oferta:** przybliżone skąd i dokąd, kwota z oferty, szacowany czas dojazdu i przejazdu. Przycisk „Przyjmuję”.
  2. **Jestem na miejscu** → 3. **Klient wsiadł** → 4. **Koniec kursu:** kwota od Ubera, opcjonalnie cena zapłacona przez klienta, napiwek i dokładne adresy.
  - Kurs anulowany, z opcjonalną opłatą za anulowanie.
- **Rozliczenie:** dla każdego kursu zapisuję osobno kwotę z oferty i kwotę od Ubera, więc widać, ile Uber faktycznie potrącił, nawet gdy zmienia prowizję. Po 3 takich kursach szacunek dla nowych ofert liczy się z twoich danych.
- **Brutto kursu:** w szczegółach kursu aplikacja pokazuje wpisaną kwotę klienta albo szacuje ją z kwoty od Ubera/oferty. To przybliżenie, bo prowizja różni się między kursami.
- **Prowizja tygodniowa:** prowizja może się różnić między kursami, ale cel z VAT wynosi 30,75% tygodniowych płatności klientów. W Historii aplikacja porównuje wpisane kwoty z tym celem i pokazuje szacowaną nadwyżkę do zwrotu w następnym tygodniu.
- **Podział z szefem:** domyślnie 50:50 od kwoty otrzymanej od Ubera po prowizji i VAT, razem z napiwkami. Nie odejmujemy kosztów kierowcy. Udział można zmienić w Ustawieniach.
- **Auto:** tankowania LPG i benzyny ze stanem licznika. Spalanie liczę metodą „od pełna do pełna”, osobno dla każdego paliwa, niezależnie od komputera auta. Paliwo z karty flotowej nie zmniejsza zarobku.
- **Historia:** zmiany pogrupowane po miesiącach.
- **Dane:** eksport kursów i tankowań do Excela (CSV), kopia zapasowa i przywracanie.
- **Kasowanie:** pojedynczy kurs lub tankowanie można usunąć w jego szczegółach. W Ustawieniach można usunąć wszystkie tankowania, wszystkie kursy (pozostawiając zmiany) albo zresetować całą aplikację wraz z ustawieniami.

## Jak liczony jest szacunek z oferty

Kwota w ofercie Ubera jest już po prowizji, ale przed VAT od prowizji, więc od Ubera przychodzi mniej. Prowizja na pojedynczych kursach jest zmienna; tygodniowy cel to 30,75% kwot zapłaconych przez klientów, a nadwyżka jest zwracana w kolejnym tygodniu.
Dopóki nie ma własnych kursów, aplikacja szacuje prowizję na podstawie 25% prowizji i 23% VAT od niej:
klient płaci 100 zł → oferta 75,00 zł → od Ubera 69,25 zł.
Po 3 kursach z wpisaną kwotą z oferty i kwotą od Ubera używa średniej z ostatnich 30 twoich kursów.
Tygodniowe zestawienie w Historii liczy tylko zakończone kursy, dla których wpisano cenę klienta i kwotę od Ubera. Tydzień rozliczeniowy trwa od poniedziałku 04:00 do kolejnego poniedziałku 04:00.

## Urządzenie docelowe

Aplikacja jest robiona i testowana pod **OPPO Reno12 Pro 5G** (model CPH2629, ColorOS 16, ekran 6,7″),
czyli widok o szerokości ok. 412 px w Chrome. Na innych telefonach też działa, ale układ jest dopasowany do tego.

## Instalacja na telefonie (OPPO / ColorOS)

1. Otwórz link w **Chrome**, a nie w wbudowanej przeglądarce ColorOS. Pełną instalację aplikacji webowej obsługuje Chrome.
2. Menu ⋮ → **Zainstaluj aplikację** (albo „Dodaj do ekranu głównego”).
3. Uruchamiaj aplikację z ikony lisa na ekranie głównym. Działa wtedy na pełnym ekranie i bez internetu.

Dane aplikacji są przechowywane w Chrome. Jeśli w ColorOS wyczyścisz dane Chrome (Ustawienia → Aplikacje → Chrome → Pamięć → Wyczyść dane),
stracisz zapisane zmiany i kursy. Zwykłe „czyszczenie pamięci podręcznej” ich nie usuwa, ale kopia zapasowa jest i tak najpewniejsza.

## Dane

Wszystko jest zapisane tylko na telefonie (`localStorage`) i nigdzie nie jest wysyłane.
Rób kopię zapasową w **Ustawienia → Zrób kopię zapasową**.

## Wygląd – podziękowania

Styl oparty na efektach z mojej kolekcji [CodePen_Things](https://github.com/V-Cancrosa/CodePen_Things) (licencja MIT):

- szklane panele: [Neon Glass Context Menu](https://codepen.io/simeydotme/pen/PwwYZOe), simeydotme
- animowana poświata przycisków: [Animated Back Glow](https://codepen.io/georgehastings/pen/xgwxgo), georgehastings
- okna dialogowe: [Modal Animations](https://codepen.io/designcouch/pen/obvKxm), designcouch

## Aktualizacja

To czysty HTML, CSS i JS, bez budowania. Po zmianach podbij numer `CACHE` w `sw.js`.
