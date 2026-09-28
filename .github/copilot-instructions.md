# AI Agent Instructions for Shougen Organizer

This document provides essential context for AI agents working with the Shougen Organizer codebase.

## Architecture Overview

This is an Angular-based web application for managing martial arts organization members and certificates. Key components:

- **Authentication**: Firebase Authentication with Google and Email providers
- **Data Storage**: Firebase Firestore with offline persistence enabled
- **UI Framework**: Angular Material for consistent design patterns

### Core Data Models

```typescript
// Key domain models:
Member {
    Id: string;
    Name: string;
    IdentificationID: string;
    Country: string;
    City: string;
    Dojo: string;
    LastCertRank: string | null;
    LastCertDate: Timestamp | null;
}

Certificate {
    Id: string;
    Code: string;
    Number: number;
    Date: Timestamp;
    Rank: string;
}
```

## Development Workflow

### Setup & Running

1. Start development server:
```bash
ng serve
```
Access at http://localhost:4200

2. Run tests:
```bash
ng test
```

### Key Architectural Patterns

1. **Firebase Integration**
- Firebase configuration in `app.firebase.module.ts`
- Firestore persistence enabled for offline support
- Authentication flow handled via FirebaseUI in `login` component

2. **Component Structure**
- Feature-based organization (`members/`, `dashboard/`, etc.)
- Each feature has its own component with HTML, SCSS, TS, and spec files
- Shared data models in `data/` directory

3. **UI Patterns**
- Consistent use of Angular Material components
- Form handling using ReactiveFormsModule
- Dialog-based editing (see `members/edit` component)

### Common Development Tasks

1. **Creating New Components**:
```bash
ng generate component components/your-component-name
```

2. **Firebase Integration**:
- All Firebase interactions should go through dedicated services
- Use AngularFirestore for data operations
- Always handle offline scenarios

## Best Practices

1. **State Management**:
- Use Firebase realtime updates for data synchronization
- Leverage Firestore offline persistence for offline-first experience

2. **Error Handling**:
- Always handle Firebase operation errors
- Use MatSnackBar for user notifications

3. **Testing**:
- Follow existing `.spec.ts` patterns for component testing
- Test both online and offline scenarios for Firebase operations

## Key Files & Directories

- `app.module.ts`: Main application configuration and imports
- `app.firebase.module.ts`: Firebase configuration and setup
- `data/`: Core data models and interfaces
- `members/`: Member management feature components
- `login/`: Authentication components

## Common Pitfalls

1. **Firebase Operations**: Always use AngularFire's observables, not raw Firebase SDK
2. **Date Handling**: Use Firestore Timestamp type for dates, not JavaScript Date
3. **Member Updates**: Ensure atomic updates when modifying member certificates