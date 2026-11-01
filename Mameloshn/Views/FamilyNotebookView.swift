import SwiftUI

struct FamilyNotebookView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingAddSheet = false

    var body: some View {
        ZStack {
            PaperBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(alignment: .top) {
                        SectionHeading(
                            "Family words",
                            eyebrow: "Your living dictionary",
                            subtitle: "Save a word exactly as your family said it. The course will never “correct” an inherited form."
                        )
                        Spacer(minLength: 16)
                        Button {
                            showingAddSheet = true
                        } label: {
                            Label("Add word", systemImage: "plus")
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                    }

                    rootsCard

                    if model.familyPhrases.isEmpty {
                        emptyNotebook
                    } else {
                        LazyVStack(spacing: 12) {
                            ForEach(model.familyPhrases) { phrase in
                                FamilyPhraseRow(phrase: phrase) {
                                    if let index = model.familyPhrases.firstIndex(where: { $0.id == phrase.id }) {
                                        model.deleteFamilyPhrases(at: IndexSet(integer: index))
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(26)
                .frame(maxWidth: 860)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Family words")
        .sheet(isPresented: $showingAddSheet) {
            FamilyPhraseEditor(defaultPlace: model.familyRoots) { phrase in
                model.addFamilyPhrase(phrase)
                showingAddSheet = false
            } onCancel: {
                showingAddSheet = false
            }
        }
    }

    private var rootsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Family roots", systemImage: "map.fill")
                    .font(.headline)
                    .foregroundStyle(AppTheme.plum)
                Spacer()
                HeritageTag()
            }
            TextField("Town, district, or route", text: $model.familyRoots)
                .textFieldStyle(.roundedBorder)
                .font(.body)
            Text("Start broad, then add exact places as you discover them: a town, Kishinev/Chișinău, Odessa, or a migration route.")
                .font(.caption)
                .foregroundStyle(AppTheme.secondaryInk)
        }
        .cardSurface(padding: 17)
    }

    private var emptyNotebook: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.text.clipboard")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(AppTheme.beet)
            Text("Start with one remembered word")
                .font(.title2.weight(.bold))
                .foregroundStyle(AppTheme.ink)
            Text("Maybe a nickname, a food, a scolding, or the way your grandparents said bobe. Write it the way it sounded to you.")
                .multilineTextAlignment(.center)
                .foregroundStyle(AppTheme.secondaryInk)
                .frame(maxWidth: 480)
            Button {
                showingAddSheet = true
            } label: {
                Label("Add the first word", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity, minHeight: 320)
        .cardSurface(padding: 26)
    }
}

private struct FamilyPhraseRow: View {
    let phrase: FamilyPhrase
    let onDelete: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 13)
                    .fill(AppTheme.beet.opacity(0.1))
                Image(systemName: "quote.opening")
                    .foregroundStyle(AppTheme.beet)
                    .font(.headline)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 5) {
                Text(phrase.transliteration)
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.ink)
                Text(phrase.meaning)
                    .foregroundStyle(AppTheme.secondaryInk)
                if !phrase.pronunciation.isEmpty {
                    Text("Sounds like: \(phrase.pronunciation)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.plum)
                }
                if !phrase.memory.isEmpty {
                    Text(phrase.memory)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.secondaryInk)
                        .padding(.top, 4)
                }
                if !phrase.place.isEmpty {
                    Label(phrase.place, systemImage: "mappin.and.ellipse")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(AppTheme.blue)
                        .padding(.top, 4)
                }
            }
            Spacer(minLength: 8)
            Menu {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .frame(width: 32, height: 32)
            }
            .menuStyle(.borderlessButton)
        }
        .cardSurface(padding: 15)
    }
}

private struct FamilyPhraseEditor: View {
    let defaultPlace: String
    let onSave: (FamilyPhrase) -> Void
    let onCancel: () -> Void

    @State private var transliteration = ""
    @State private var meaning = ""
    @State private var pronunciation = ""
    @State private var memory = ""
    @State private var place: String

    init(
        defaultPlace: String,
        onSave: @escaping (FamilyPhrase) -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.defaultPlace = defaultPlace
        self.onSave = onSave
        self.onCancel = onCancel
        _place = State(initialValue: defaultPlace)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("The word or phrase") {
                    TextField("Write it as it sounded", text: $transliteration)
                    TextField("What did it mean?", text: $meaning)
                    TextField("Break down the pronunciation", text: $pronunciation)
                }

                Section("The memory") {
                    TextField("Who said it, and when?", text: $memory, axis: .vertical)
                        .lineLimit(3...6)
                    TextField("Town or region", text: $place)
                }

                Section {
                    Text("Use Latin letters however they make sense to you. You can normalize the spelling later without losing the family version.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.secondaryInk)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Add a family word")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(
                            FamilyPhrase(
                                transliteration: transliteration.trimmingCharacters(in: .whitespacesAndNewlines),
                                meaning: meaning.trimmingCharacters(in: .whitespacesAndNewlines),
                                pronunciation: pronunciation.trimmingCharacters(in: .whitespacesAndNewlines),
                                memory: memory.trimmingCharacters(in: .whitespacesAndNewlines),
                                place: place.trimmingCharacters(in: .whitespacesAndNewlines)
                            )
                        )
                    }
                    .disabled(transliteration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || meaning.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .frame(minWidth: 440, minHeight: 520)
    }
}
