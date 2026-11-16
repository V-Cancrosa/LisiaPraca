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
- **Wypłata od szefa (opcjonalnie):** procent od kwoty od Ubera albo stawka godzinowa. Daje kwotę „Dla mnie” przy każdej zmianie.
- **Auto:** tankowania LPG i benzyny ze stanem licznika. Spalanie liczę metodą „od pełna do pełna”, osobno dla każdego paliwa, niezależnie od komputera auta. Paliwo z karty flotowej nie zmniejsza zarobku.
- **Historia:** zmiany pogrupowane po miesiącach.
- **Dane:** eksport kursów i tankowań do Excela (CSV), kopia zapasowa i przywracanie.

## Jak liczony jest szacunek z oferty

Kwota w ofercie Ubera jest już po prowizji, ale przed VAT od prowizji, więc od Ubera przychodzi mniej.
Dopóki nie ma własnych kursów, aplikacja przyjmuje prowizję 25% i VAT od prowizji 23% (dane z internetu):
klient płaci 100 zł → oferta 75,00 zł → od Ubera 69,25 zł.
Po 3 kursach z wpisaną kwotą z oferty i kwotą od Ubera używa średniej z ostatnich 30 twoich kursów.

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
