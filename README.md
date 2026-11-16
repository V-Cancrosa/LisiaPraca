# Lisia Praca

Aplikacja na telefon (PWA) dla kierowcy jeżdżącego dla Ubera we flocie.

**Aplikacja: https://v-cancrosa.github.io/LisiaPraca/**

## Co robi

- **Zmiana:** „Włączam aplikację” / „Wyłączam aplikację” zapisuje czas w aplikacji Ubera.
- **Kurs w etapach**, tak jak w aplikacji Ubera:
  1. **Oferta:** przybliżone skąd i dokąd, kwota z oferty, szacowany czas dojazdu i przejazdu. Przycisk „Przyjmuję”.
  2. **Jestem na miejscu** → 3. **Klient wsiadł** → 4. **Koniec kursu:** kwota od Ubera, opcjonalnie cena zapłacona przez klienta, napiwek i dokładne adresy.
  - Kurs anulowany, z opcjonalną opłatą za anulowanie.
- **Rozliczenie:** dla każdego kursu zapisuję osobno kwotę z oferty i kwotę od Ubera, więc widać, ile Uber faktycznie potrącił, nawet gdy zmienia prowizję. Kwota na rękę jest szacowana według stawek w Ustawieniach (prowizja, VAT od prowizji, VAT od przejazdu, opłata floty).
- **Auto:** tankowania LPG i benzyny ze stanem licznika. Spalanie liczę metodą „od pełna do pełna”, osobno dla każdego paliwa, niezależnie od komputera auta. Paliwo z karty flotowej nie zmniejsza zarobku.
- **Historia:** zmiany pogrupowane po miesiącach.
- **Dane:** eksport kursów i tankowań do Excela (CSV), kopia zapasowa i przywracanie.

## Jak liczone są szacunki

Przykład przy domyślnych stawkach (prowizja 25%, VAT od prowizji 23%, VAT od przejazdu 8%):

| | zł |
|---|---|
| Klient płaci | 100,00 |
| Oferta w aplikacji (po prowizji 25%) | 75,00 |
| Od Ubera (po VAT 23% od prowizji) | 69,25 |
| Na rękę (po VAT 8% od przejazdu, przed opłatą floty) | ~61,84 |

Stawki to szacunek. Sprawdź je w rozliczeniu od floty i popraw w Ustawieniach.

## Instalacja na telefonie

Otwórz link w Chrome → menu ⋮ → **Zainstaluj aplikację** (albo „Dodaj do ekranu głównego”).
Po instalacji aplikacja działa także bez internetu.

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
