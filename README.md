# Lisia Praca

Aplikacja na telefon (PWA) do szybkiego zapisywania pracy kierowcy we flocie:

- **Zmiana:** „Włączam aplikację” / „Wyłączam aplikację” zapisuje godziny jednym kliknięciem.
- **Kurs:** skąd, dokąd i kwota. „Ruszam” zapisuje godzinę wyjazdu, a „Dotarłem” godzinę dojazdu.
- **Tankowanie:** LPG albo benzyna, kwota i litry.
- **Podsumowanie zmiany:** liczba kursów, zarobek, paliwo, kwota na czysto i zarobek na godzinę.
- **Historia:** wszystkie zmiany i podsumowanie miesiąca.
- **Eksport:** plik CSV do Excela oraz kopia zapasowa JSON z możliwością przywrócenia.

Kwoty można wpisywać z przecinkiem (`42,50`) albo z kropką.

## Instalacja na telefonie

1. Otwórz stronę aplikacji w Chrome na Androidzie.
2. Wybierz menu ⋮ → **Dodaj do ekranu głównego** albo **Zainstaluj aplikację**.

Po instalacji aplikacja działa także bez internetu.

## Dane

Wszystko jest zapisane lokalnie na telefonie (`localStorage`) i nigdzie nie jest wysyłane.
Co jakiś czas zrób kopię zapasową w zakładce **Historia → Zrób kopię zapasową**.

## Aktualizacja

To czysty HTML, CSS i JS bez budowania. Po zmianach podbij numer `CACHE` w `sw.js`,
żeby zainstalowane aplikacje pobrały nową wersję.
