import SwiftUI

enum AppTheme {
    static let paper = Color(red: 0.965, green: 0.941, blue: 0.886)
    static let paperDeep = Color(red: 0.918, green: 0.875, blue: 0.790)
    static let ink = Color(red: 0.105, green: 0.102, blue: 0.135)
    static let secondaryInk = Color(red: 0.340, green: 0.315, blue: 0.345)
    static let plum = Color(red: 0.325, green: 0.155, blue: 0.300)
    static let beet = Color(red: 0.620, green: 0.145, blue: 0.210)
    static let honey = Color(red: 0.875, green: 0.585, blue: 0.145)
    static let sage = Color(red: 0.300, green: 0.490, blue: 0.390)
    static let blue = Color(red: 0.220, green: 0.405, blue: 0.570)
    static let clay = Color(red: 0.655, green: 0.335, blue: 0.245)

    static func color(for tone: LessonTone) -> Color {
        switch tone {
        case .plum: plum
        case .beet: beet
        case .honey: honey
        case .sage: sage
        case .blue: blue
        case .clay: clay
        }
    }
}

struct PaperBackground: View {
    var body: some View {
        ZStack {
            AppTheme.paper
            Circle()
                .fill(AppTheme.honey.opacity(0.08))
                .frame(width: 420, height: 420)
                .blur(radius: 2)
                .offset(x: 210, y: -300)
            Circle()
                .fill(AppTheme.plum.opacity(0.055))
                .frame(width: 360, height: 360)
                .offset(x: -230, y: 330)
        }
        .ignoresSafeArea()
    }
}

struct CardSurface: ViewModifier {
    var padding: CGFloat = 18

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(.white.opacity(0.74), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.white.opacity(0.9), lineWidth: 1)
            }
            .shadow(color: AppTheme.ink.opacity(0.07), radius: 18, y: 8)
    }
}

extension View {
    func cardSurface(padding: CGFloat = 18) -> some View {
        modifier(CardSurface(padding: padding))
    }
}

struct MameloshnWordmark: View {
    var compact = false

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(AppTheme.beet)
                Image(systemName: "quote.bubble.fill")
                    .foregroundStyle(.white)
                    .font(.system(size: compact ? 15 : 18, weight: .bold))
            }
            .frame(width: compact ? 34 : 42, height: compact ? 34 : 42)

            VStack(alignment: .leading, spacing: 0) {
                Text("Ziskeit")
                    .font(.system(compact ? .headline : .title3, design: .rounded, weight: .bold))
                    .foregroundStyle(AppTheme.ink)
                if !compact {
                    Text("ZISS-kite · “my sweet one”")
                        .font(.caption)
                        .foregroundStyle(AppTheme.secondaryInk)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Ziskeit, pronounced ZISS-kite, my sweet one")
    }
}
